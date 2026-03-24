import jwt from 'jsonwebtoken';

export function signToken(user) {
  const jwtSecret = process.env.JWT_SECRET;
  if (!jwtSecret) {
    throw new Error('JWT_SECRET tanimli olmadan token olusturulamaz.');
  }

  return jwt.sign(
    {
      id: user.id,
      email: user.email,
      companyName: user.company_name || user.companyName || 'Teklifim',
      planCode: user.plan_code || user.planCode || 'starter'
    },
    jwtSecret,
    { expiresIn: '7d' }
  );
}
