"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function AuthPage() {
  const [isLogin, setIsLogin] = useState(true);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const router = useRouter();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    const url = isLogin ? "/api/auth/login" : "/api/auth/register";
    const body = isLogin ? { email, password } : { name, email, password };

    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Something went wrong");
        return;
      }

      // Store token and user in localStorage
      localStorage.setItem("token", data.token);
      localStorage.setItem("user", JSON.stringify(data.user));

      // Redirect to todos page
      router.push("/todos");
    } catch (err) {
      setError("Network error. Please try again.");
    }
  };

  return (
    <div className="auth-container">
      <h1>{isLogin ? "Welcome back" : "Create account"}</h1>
      <p className="auth-subtitle">
        {isLogin ? "Sign in to your task manager" : "Get started with task management"}
      </p>

      {error && <div className="error">{error}</div>}

      <form onSubmit={handleSubmit}>
        {!isLogin && (
          <div className="form-group">
            <label>Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your name"
              required
            />
          </div>
        )}

        <div className="form-group">
          <label>Email</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="your@email.com"
            required
          />
        </div>

        <div className="form-group">
          <label>Password</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            required
          />
        </div>

        <button type="submit" className="btn btn-primary">
          {isLogin ? "Login" : "Register"}
        </button>
      </form>

      <div className="toggle-link">
        {isLogin ? "Don't have an account?" : "Already have an account?"}{" "}
        <a onClick={() => { setIsLogin(!isLogin); setError(""); }}>
          {isLogin ? "Register" : "Login"}
        </a>
      </div>
    </div>
  );
}
