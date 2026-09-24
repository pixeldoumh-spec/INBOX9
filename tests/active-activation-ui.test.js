test('active lifecycle keeps timing internal and shows plain waiting states', async () => {
  const app = await read('app.js');
  assert.match(app, /const expiresAt = Number\(activation\.expiresAt/);
  assert.match(app, /const createdAt = Number\(activation\.createdAt/);
  assert.match(app, /Waiting for number/);
  assert.match(app, /Waiting for OTP/);
  assert.doesNotMatch(app, /numberFetchClock/);
  assert.doesNotMatch(app, /otpClock/);
  assert.doesNotMatch(app, /const total = Math\.max\(1, expiresAt - createdAt/);
});