import jwt from "jsonwebtoken";

const SECRET = process.env.JWT_SECRET || "todo-app-secret-key-123";

export function generateToken(user) {
  return jwt.sign({ id: user.id, email: user.email }, SECRET, {
    expiresIn: "24h",
  });
}

export function verifyToken(token) {
  try {
    return jwt.verify(token, SECRET);
  } catch {
    return null;
  }
}
