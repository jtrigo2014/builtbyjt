const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    const params = new URLSearchParams(event.body);
    const data = Object.fromEntries(params);

    if (data.seller_id !== process.env.GUMROAD_SELLER_ID) {
      return { statusCode: 401, body: 'Unauthorized' };
    }

    const email = data.email?.toLowerCase().trim();
    if (!email) return { statusCode: 400, body: 'No email' };

    const isRefunded = data.refunded === 'true';
    const isCancelled = data.cancelled === 'true';

    if (isRefunded || isCancelled) {
      await supabase
        .from('profiles')
        .update({
          is_paid: false,
          subscription_status: isCancelled ? 'cancelled' : 'refunded'
        })
        .eq('email', email);
      return { statusCode: 200, body: 'Access revoked' };
    }

    // Check if user already exists
    const { data: existingUsers } = await supabase.auth.admin.listUsers();
    const existingUser = existingUsers?.users?.find(u => u.email === email);
    let userId;

    if (existingUser) {
      userId = existingUser.id;
    } else {
      // Create new user with temp password
      const tempPassword = Math.random().toString(36).slice(-8) + '!A1';
      const { data: newUser, error: createError } = await supabase.auth.admin.createUser({
        email,
        password: tempPassword,
        email_confirm: true,
      });
      if (createError) throw createError;
      userId = newUser.user.id;
    }

    // Grant access
    await supabase.from('profiles').upsert({
      id: userId,
      email,
      is_paid: true,
      subscription_status: 'active',
      gumroad_sale_id: data.sale_id || null,
    });

    // Send password reset email so user sets their own password
    await supabase.auth.admin.generateLink({
      type: 'recovery',
      email,
      options: {
        redirectTo: 'https://builtbyjt.vercel.app/reset.html'
      }
    });

    console.log('Access granted to:', email);
    return { statusCode: 200, body: 'OK' };

  } catch (err) {
    console.error('Webhook error:', err);
    return { statusCode: 500, body: 'Internal error' };
  }
};
