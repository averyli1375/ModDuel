"use client";

import { useState } from "react";
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
  const [expandedEmailId, setExpandedEmailId] = useState<string | null>(null);

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
    <div className="wood-board p-1 shadow-inner h-full flex flex-col">
      <div className="wood-panel border-4 border-wood-dark p-3 h-full flex flex-col relative overflow-hidden">
        {/* Decorative corner nails */}
        <div className="absolute top-1 left-1 w-2 h-2 rounded-full bg-wood-dark shadow-sm" />
        <div className="absolute top-1 right-1 w-2 h-2 rounded-full bg-wood-dark shadow-sm" />
        <div className="absolute bottom-1 left-1 w-2 h-2 rounded-full bg-wood-dark shadow-sm" />
        <div className="absolute bottom-1 right-1 w-2 h-2 rounded-full bg-wood-dark shadow-sm" />
        
        <h2 className="font-[family-name:var(--font-western)] text-parchment text-xl mb-3 flex items-center justify-center gap-2 drop-shadow-md text-center border-b-2 border-wood-dark pb-2">
          <span className="text-gold">★</span> Sheriff's Mailbox <span className="text-gold">★</span>
        </h2>
        <div className="flex-1 overflow-y-auto space-y-3 px-1 custom-scrollbar">
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
                onClick={() => setExpandedEmailId(expandedEmailId === email.id ? null : email.id)}
                className={`p-3 relative transition-all animate-slide-in paper-texture shadow-md cursor-pointer hover:brightness-95 ${
                  isSuspicious && isRead
                    ? "border-danger/50 bg-red-900/10 text-red-950 font-bold"
                    : isRead
                      ? "border-wood-medium/30 bg-parchment text-wood-dark"
                      : "border-wood-dark/50 bg-parchment text-black font-bold scale-[1.01]"
                } ${isSuspicious ? 'skew-y-1 z-10' : '-skew-y-1 z-0'} ${expandedEmailId === email.id ? '!skew-y-0 scale-[1.02] shadow-lg z-20' : ''}`}
              >
                {/* Pin graphic */}
                <div className="absolute -top-2 left-1/2 -translate-x-1/2 w-3 h-3 rounded-full bg-zinc-400 shadow-md border border-zinc-600 z-10" />

                <div className="flex items-start justify-between gap-2 mt-1">
                  <div className="flex-1 min-w-0">
                    <p className={`text-xs truncate font-mono ${isSuspicious && isRead ? 'text-red-900/80' : 'text-stone-700'}`}>
                      From: {email.from}
                    </p>
                    <p
                      className={`text-sm mt-1 mb-1 font-[family-name:var(--font-western)] tracking-wide ${expandedEmailId === email.id ? '' : 'truncate'} ${
                        isSuspicious ? "text-danger" : ""
                      }`}
                    >
                      {email.subject}
                    </p>
                  </div>
                  <div className="flex-shrink-0">
                    {isRead ? (
                      <span className="text-xs px-2 py-0.5 stamp-safeguard opacity-60">
                        OPENED
                      </span>
                    ) : (
                      <span className="text-xs px-2 py-0.5 stamp-danger !text-danger animate-pulse">
                        NEW
                      </span>
                    )}
                  </div>
                </div>
                {content && (
                  <div className="mt-2 pt-2 border-t border-wood-medium/20 text-left">
                    <p className="text-xs text-wood-dark whitespace-pre-wrap leading-relaxed max-h-32 overflow-y-auto font-serif">
                      {content}
                    </p>
                  </div>
                )}
                {!content && expandedEmailId === email.id && (
                  <div className="mt-2 pt-2 border-t border-wood-medium/20 text-center">
                    <p className="text-xs text-wood-dark/70 italic font-serif">
                      (Sealed envelope)
                    </p>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
    </div>
  );
}
