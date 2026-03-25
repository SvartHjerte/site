module.exports = function (req, res) {
  res.status(200).json({
    ok: true,
    message: "Hello from Vercel server function"
  });
};