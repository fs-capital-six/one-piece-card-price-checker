function requireAuth(req, res, next) {
  if (req.session?.user) {
    return next();
  }

  if (req.accepts('html')) {
    const returnTo = encodeURIComponent(req.originalUrl || '/facebook-group-tools');
    return res.redirect(`/auth/facebook?returnTo=${returnTo}`);
  }

  return res.status(401).json({ error: 'Login diperlukan' });
}

module.exports = { requireAuth };
