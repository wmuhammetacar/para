import jwt from 'jsonwebtoken';

export function signToken(user) {
  return jwt.sign(
    {
      id: user.id,
      email: user.email,
      companyName: user.company_name || user.companyName || 'Teklifim',
      planCode: user.plan_code || user.planCode || 'starter'
    },
    process.env.JWT_SECRET || 'dev_secret',
    { expiresIn: '7d' }
  );
}
