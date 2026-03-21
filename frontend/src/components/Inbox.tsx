"use client";

import { Action } from "@/lib/api";

interface Email {
  id: string;
  from: string;
  subject: string;
}

interface InboxProps {
  emails: Email[];
  readEmails: Set<string>;
  actions: Action[];
}

export default function Inbox({ emails, readEmails, actions }: InboxProps) {
  // Find email content from read_email tool results
  const getEmailContent = (emailId: string): string | null => {
    const readAction = actions.find(
      (a) =>
        a.tool_name === "read_email" &&
        a.tool_input &&
        JSON.parse(a.tool_input).email_id === emailId
    );
    if (readAction?.tool_output) {
      try {
        const output = JSON.parse(readAction.tool_output);
        return output.body || null;
      } catch {
        return null;
      }
    }
    return null;
  };

  return (
    <div className="parchment-card p-4 h-full flex flex-col">
      <h2 className="font-[family-name:var(--font-western)] text-gold text-lg mb-3 flex items-center gap-2">
        <span className="text-xl">📨</span> DISPATCH
      </h2>
      <div className="flex-1 overflow-y-auto space-y-2">
        {emails.length === 0 ? (
          <p className="text-parchment-dark text-sm italic">
            No dispatches in the inbox...
          </p>
        ) : (
          emails.map((email) => {
            const isRead = readEmails.has(email.id);
            const content = isRead ? getEmailContent(email.id) : null;
            const isSuspicious =
              email.subject.includes("CONFIDENTIAL") ||
              email.subject.includes("URGENT") ||
              email.subject.includes("OVERRIDE") ||
              email.from.includes("external");

            return (
              <div
                key={email.id}
                className={`p-3 rounded border transition-all ${
                  isSuspicious && isRead
                    ? "border-danger/50 bg-blood-red/10"
                    : isRead
                      ? "border-gold/30 bg-wood-light/30"
                      : "border-wood-light/30 bg-wood-medium/50"
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-parchment-dark truncate">
                      From: {email.from}
                    </p>
                    <p
                      className={`text-sm font-medium truncate ${
                        isRead ? "text-gold" : "text-parchment"
                      }`}
                    >
                      {email.subject}
                    </p>
                  </div>
                  <div className="flex-shrink-0">
                    {isRead ? (
                      <span className="text-xs px-2 py-0.5 rounded bg-gold/20 text-gold">
                        READ
                      </span>
                    ) : (
                      <span className="text-xs px-2 py-0.5 rounded bg-wood-light/50 text-parchment-dark">
                        NEW
                      </span>
                    )}
                  </div>
                </div>
                {content && (
                  <div className="mt-2 pt-2 border-t border-wood-light/20">
                    <p className="text-xs text-parchment-dark whitespace-pre-wrap leading-relaxed max-h-32 overflow-y-auto">
                      {content}
                    </p>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
