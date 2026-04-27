export default async function handler(req, res) {
  const response = await fetch('https://builtbyjt.vercel.app/api/gumroad-webhook', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      seller_id: 'INSyDgxJyVwuG516KwF1Ew==',
      email: 'javier@bighillventures.net',
      sale_id: 'test_999',
      refunded: 'false',
      cancelled: 'false'
    }).toString()
  });
  
  const text = await response.text();
  res.status(200).send('Response: ' + text);
}
