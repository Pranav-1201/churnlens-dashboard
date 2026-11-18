import { Component, type ErrorInfo, type ReactNode } from "react";
import { Button } from "@/components/ui/button";

interface Props {
  children: ReactNode;
  /** Changes when the visitor moves to another route; a new key clears a caught error. */
  resetKey: string;
}

interface State {
  error: Error | null;
}

/**
 * Roadmap F14. Without a boundary, one exception while rendering a page unmounts the whole
 * app and leaves a blank screen. This keeps the layout (sidebar, header) alive, says what
 * happened, and offers a way back. Errors are still logged for debugging.
 */
export class RouteErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("RouteErrorBoundary caught:", error, info.componentStack);
  }

  componentDidUpdate(prev: Props) {
    if (this.state.error && prev.resetKey !== this.props.resetKey) {
      this.setState({ error: null });
    }
  }

  private retry = () => this.setState({ error: null });

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div role="alert" className="glass-card p-6 max-w-xl space-y-3">
        <h2 className="text-lg font-semibold">This page hit a problem</h2>
        <p className="text-sm text-muted-foreground">
          The rest of the app is still working. You can try this page again or pick another page
          from the sidebar.
        </p>
        <Button variant="outline" onClick={this.retry}>
          Try again
        </Button>
      </div>
    );
  }
}
