/** Two-pane chat frame. Matches the signed-in layout so the lists fill the same boxes. */
export function ChatPageSkeleton() {
  return (
    <div className="min-h-screen bg-background">
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8 lg:py-12">
        <div className="mb-8">
          <h1 className="mb-2 text-4xl font-bold tracking-tight lg:text-5xl">Chat</h1>
          <p className="text-lg text-muted-foreground">Direct messages and group chats</p>
        </div>
        <div className="grid h-[calc(100vh-300px)] min-h-[600px] grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="animate-pulse overflow-hidden rounded-xl border border-border bg-card lg:col-span-1" />
          <div className="animate-pulse overflow-hidden rounded-xl border border-border bg-card lg:col-span-2" />
        </div>
      </main>
    </div>
  );
}
