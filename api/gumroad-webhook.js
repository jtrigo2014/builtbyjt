const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).send('Method Not Allowed');
  }

  try {
    const params = new URLSearchParams(req.body);
    const data = Object.fromEntries(params);

    if (data.seller_id !== process.env.GUMROAD_SELLER_ID) {
      return res.status(401).send('Unauthorized');
    }

    const email = data.email?.toLowerCase().trim();
    if (!email) return res.status(400).send('No email');

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
      return res.status(200).send('Access revoked');
    }

    const { data: existingUsers } = await supabase.auth.admin.listUsers();
    const existingUser = existingUsers?.users?.find(u => u.email === email);
    let userId;

    if (existingUser) {
      userId = existingUser.id;
    } else {
      const tempPassword = Math.random().toString(36).slice(-8) + '!A1';
      const { data: newUser, error: createError } = await supabase.auth.admin.createUser({
        email,
        password: tempPassword,
        email_confirm: true,
      });
      if (createError) throw createError;
      userId = newUser.user.id;
    }

    await supabase.from('profiles').upsert({
      id: userId,
      email,
      is_paid: true,
      subscription_status: 'active',
      gumroad_sale_id: data.sale_id || null,
    });

    await supabase.auth.admin.generateLink({
      type: 'recovery',
      email,
      options: {
        redirectTo: 'https://builtbyjt.vercel.app/reset.html'
      }
    });

    console.log('Access granted to:', email);
    return res.status(200).send('OK');

  } catch (err) {
    console.error('Webhook error:', err);
    return res.status(500).send('Internal error');
  }
}
