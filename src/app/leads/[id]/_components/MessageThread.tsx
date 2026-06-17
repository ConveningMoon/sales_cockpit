type Message = {
  id: string;
  direction: string;
  body: string;
  sent_at: string;
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("es", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function MessageThread({ messages }: { messages: Message[] }) {
  if (messages.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-4 text-center">
        Sin mensajes registrados todavía.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {messages.map((msg) => {
        const isOutbound = msg.direction === "outbound";
        return (
          <div
            key={msg.id}
            className={`rounded-lg px-4 py-3 text-sm ${
              isOutbound
                ? "bg-primary/10 border border-primary/20 ml-6"
                : "bg-muted border border-border mr-6"
            }`}
          >
            <div className="flex items-center justify-between mb-1.5 gap-2">
              <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {isOutbound ? "Dylan" : "Lead"}
              </span>
              <span className="text-xs text-muted-foreground shrink-0">
                {formatDate(msg.sent_at)}
              </span>
            </div>
            <p className="whitespace-pre-wrap leading-relaxed">{msg.body}</p>
          </div>
        );
      })}
    </div>
  );
}
