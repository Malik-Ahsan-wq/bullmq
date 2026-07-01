"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";

export default function InvitePage() {
  const params = useParams();
  const router = useRouter();
  const { token } = params;

  const [invite, setInvite] = useState(null);
  const [project, setProject] = useState(null);
  const [inviter, setInviter] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [accepting, setAccepting] = useState(false);
  const [accepted, setAccepted] = useState(false);

  useEffect(() => {
    if (!token) return;

    const fetchInvite = async () => {
      try {
        const res = await fetch(`/api/invite/${token}`);
        const data = await res.json();

        if (!res.ok) {
          setError(data.error || "Failed to load invite");
          return;
        }

        setInvite(data.invite);
        setProject(data.project);
        setInviter(data.inviter);

        if (data.alreadyMember) {
          setError("You are already a member of this project.");
        }
      } catch (err) {
        setError("Network error. Please try again.");
      } finally {
        setLoading(false);
      }
    };

    fetchInvite();
  }, [token]);

  const handleAccept = async () => {
    setAccepting(true);
    setError("");

    try {
      const res = await fetch("/api/invite/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Failed to accept invite");
        return;
      }

      setAccepted(true);
    } catch (err) {
      setError("Network error. Please try again.");
    } finally {
      setAccepting(false);
    }
  };

  if (loading) {
    return (
      <div className="auth-container">
        <div className="loading">Loading invitation...</div>
      </div>
    );
  }

  if (accepted) {
    return (
      <div className="auth-container">
        <h1 style={{ color: "#28a745" }}>Invite Accepted!</h1>
        <p style={{ textAlign: "center", color: "#666", margin: "20px 0" }}>
          You have successfully joined <strong>{project?.name}</strong>.
        </p>
        <button
          className="btn btn-primary"
          onClick={() => router.push("/todos")}
          style={{ width: "100%" }}
        >
          Go to Dashboard
        </button>
      </div>
    );
  }

  return (
    <div className="auth-container">
      <h1>Project Invitation</h1>

      {error && <div className="error">{error}</div>}

      {project && (
        <div style={{ marginBottom: "20px" }}>
          <p style={{ color: "#666", margin: "10px 0" }}>
            <strong style={{ color: "#0070f3" }}>
              {inviter?.name || "Someone"}
            </strong>{" "}
            has invited you to join:
          </p>
          <div
            style={{
              background: "#f9f9f9",
              padding: "15px",
              borderRadius: "8px",
              border: "1px solid #eee",
            }}
          >
            <h2 style={{ margin: "0 0 5px 0", fontSize: "18px" }}>
              {project.name}
            </h2>
            {project.description && (
              <p style={{ margin: 0, color: "#666", fontSize: "14px" }}>
                {project.description}
              </p>
            )}
          </div>
        </div>
      )}

      {invite && invite.status === "pending" && (
        <button
          className="btn btn-primary"
          onClick={handleAccept}
          disabled={accepting}
          style={{ width: "100%" }}
        >
          {accepting ? "Accepting..." : "Accept Invitation"}
        </button>
      )}
    </div>
  );
}
