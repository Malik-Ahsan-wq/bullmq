const jwt = require("jsonwebtoken");

const SECRET = process.env.JWT_SECRET || "todo-app-secret-key-123";

function generateToken(user) {
  return jwt.sign({ id: user.id, email: user.email }, SECRET, {
    expiresIn: "24h",
  });
}

function verifyToken(token) {
  try {
    return jwt.verify(token, SECRET);
  } catch {
    return null;
  }
}

module.exports = { generateToken, verifyToken };
