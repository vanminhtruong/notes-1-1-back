exports.notFound = (req, res, _next) => {
  res.status(404).json({ message: 'Resource not found' });
};

exports.errorHandler = (err, req, res, _next) => {
  const status = err.status || err.statusCode || 500;
  const message = err.message || 'Internal Server Error';
  if (process.env.NODE_ENV !== 'test') {
    // eslint-disable-next-line no-console
    console.error(err);
  }
  res.status(status).json({ message });
};
