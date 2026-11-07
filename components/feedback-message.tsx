import { CircleAlert, CircleCheck, Info, LoaderCircle } from "lucide-react";

export type FeedbackKind = "error" | "success" | "warning" | "progress";

const feedbackIcons = {
  error: CircleAlert,
  success: CircleCheck,
  warning: Info,
  progress: LoaderCircle,
};

export function FeedbackMessage({ kind, title, message }: { kind: FeedbackKind; title: string; message: string }) {
  const Icon = feedbackIcons[kind];
  const isUrgent = kind === "error" || kind === "warning";

  return (
    <div className={`feedback-message feedback-${kind}`} role={isUrgent ? "alert" : "status"} aria-live={isUrgent ? "assertive" : "polite"}>
      <span className="feedback-message-icon" aria-hidden="true"><Icon size={19} /></span>
      <span className="feedback-message-copy"><b>{title}</b><span>{message}</span></span>
    </div>
  );
}
