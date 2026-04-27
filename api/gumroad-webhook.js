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
        .update({ is_paid: false, subscription_status: isCancelled ? 'cancelled' : 'refunded' })
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

    // Generate reset link
    const { data: linkData, error: linkError } = await supabase.auth.admin.generateLink({
      type: 'recovery',
      email,
      options: {
        redirectTo: 'https://builtbyjt.vercel.app/reset.html'
      }
    });
    if (linkError) throw linkError;

    const resetLink = linkData?.properties?.action_link;

    // Send welcome email via Resend
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.RESEND_API_KEY}`
      },
      body: JSON.stringify({
        from: 'Built by JT <noreply@builtbyjt.net>',
        to: email,
        subject: 'Set your password — Built by JT',
        html: `
          <div style="background:#0a0a0a;padding:40px;font-family:sans-serif;color:#f0f0f0;max-width:500px;margin:0 auto;">
            <h1 style="font-size:32px;letter-spacing:2px;color:#e8ff47;margin-bottom:8px;">BUILT BY JT</h1>
            <p style="color:#666;font-size:12px;letter-spacing:2px;text-transform:uppercase;margin-bottom:32px;">Built Not Born</p>
            <h2 style="font-size:22px;margin-bottom:16px;">Welcome! Set your password.</h2>
            <p style="color:#888;margin-bottom:24px;line-height:1.6;">Your purchase was successful. Click below to set your password and access your training program.</p>
            <a href="${resetLink}" style="background:#e8ff47;color:#0a0a0a;padding:14px 28px;text-decoration:none;border-radius:8px;font-weight:700;font-size:15px;display:inline-block;margin-bottom:24px;">Set My Password →</a>
            <p style="color:#555;font-size:12px;line-height:1.6;">If the button doesn't work, copy this link into your browser:<br>${resetLink}</p>
            <p style="color:#333;font-size:11px;margin-top:32px;">This link expires in 24 hours.</p>
          </div>
        `
      })
    });

    console.log('Access granted and email sent to:', email);
    return res.status(200).send('OK');

  } catch (err) {
    console.error('Webhook error:', err);
    return res.status(500).send('Internal error: ' + err.message);
  }
}
