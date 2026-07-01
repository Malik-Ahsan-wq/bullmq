const nodemailer = require("nodemailer");

let cachedTransport = null;

async function getTransport() {
  if (cachedTransport) {
    return cachedTransport;
  }

  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!user || !pass) {
    throw new Error(
      "SMTP credentials not configured. Set SMTP_USER and SMTP_PASS in .env.local"
    );
  }

  cachedTransport = nodemailer.createTransport({
    host: process.env.SMTP_HOST || "smtp.gmail.com",
    port: parseInt(process.env.SMTP_PORT || "587"),
    secure: false,
    auth: {
      user: user,
      pass: pass.replace(/\s/g, ""),
    },
    tls: {
      rejectUnauthorized: false,
    },
  });

  await cachedTransport.verify();
  console.log("Gmail SMTP connected successfully");

  return cachedTransport;
}

async function sendInviteEmail({ email, projectName, inviterName, token }) {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const inviteLink = `${baseUrl}/invite/${token}`;

  const transport = await getTransport();
  const fromAddress = process.env.SMTP_USER;

  const mailOptions = {
    from: `"Todo App" <${fromAddress}>`,
    to: email,
    subject: `You've been invited to join "${projectName}"`,
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; background: #f5f5f5; margin: 0; padding: 20px; }
          .container { max-width: 600px; margin: 0 auto; background: white; border-radius: 8px; padding: 30px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
          h1 { color: #333; font-size: 24px; }
          p { color: #666; line-height: 1.6; }
          .btn { display: inline-block; background: #0070f3; color: white; text-decoration: none; padding: 12px 24px; border-radius: 6px; font-weight: bold; margin: 20px 0; }
          .btn:hover { background: #0051a8; }
          .footer { margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; color: #999; font-size: 12px; }
        </style>
      </head>
      <body>
        <div class="container">
          <h1>Project Invitation</h1>
          <p><strong>${inviterName}</strong> has invited you to join the project <strong>"${projectName}"</strong>.</p>
          <p>Click the button below to accept the invitation:</p>
          <a href="${inviteLink}" class="btn">Accept Invitation</a>
          <p>Or copy this link: <a href="${inviteLink}">${inviteLink}</a></p>
          <p>This invitation will expire in 7 days.</p>
          <div class="footer">
            <p>If you didn't expect this invitation, you can safely ignore this email.</p>
          </div>
        </div>
      </body>
      </html>
    `,
    text: `${inviterName} has invited you to join "${projectName}". Accept here: ${inviteLink}`,
  };

  const info = await transport.sendMail(mailOptions);
  return info;
}

module.exports = { getTransport, sendInviteEmail };
