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
        <div className="invite-success-icon">&#10003;</div>
        <h1 style={{ color: "#059669", textAlign: "center" }}>Invite Accepted!</h1>
        <p style={{ textAlign: "center", color: "#6b7280", margin: "16px 0 28px", fontSize: "14px", lineHeight: "1.6" }}>
          You have successfully joined <strong style={{ color: "#1f2937" }}>{project?.name}</strong>.
        </p>
        <button
          className="btn btn-primary"
          onClick={() => router.push("/todos")}
        >
          Go to Dashboard
        </button>
      </div>
    );
  }

  return (
    <div className="auth-container">
      <h1>Project Invitation</h1>
      <p className="auth-subtitle">You've been invited to collaborate</p>

      {error && <div className="error">{error}</div>}

      {project && (
        <div style={{ marginBottom: "24px" }}>
          <p style={{ color: "#6b7280", margin: "0 0 12px", fontSize: "14px" }}>
            <strong style={{ color: "#4f46e5" }}>
              {inviter?.name || "Someone"}
            </strong>{" "}
            has invited you to join:
          </p>
          <div className="invite-project-card">
            <h2>{project.name}</h2>
            {project.description && (
              <p>{project.description}</p>
            )}
          </div>
        </div>
      )}

      {invite && invite.status === "pending" && (
        <button
          className="btn btn-primary"
          onClick={handleAccept}
          disabled={accepting}
        >
          {accepting ? "Accepting..." : "Accept Invitation"}
        </button>
      )}
    </div>
  );
}
