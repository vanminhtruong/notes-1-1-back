export default (fn) => (req, res, next) => {
  if (req.releaseChatCapacity) req.chatWorkStarted = true;
  return Promise.resolve().then(() => fn(req, res, next)).catch(next)
    .finally(() => req.releaseChatCapacity?.());
};
