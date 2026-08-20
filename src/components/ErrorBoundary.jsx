import { Component } from "react";

export default class ErrorBoundary extends Component {
  state = { error: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error("Tarifim crashed:", error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex flex-1 flex-col gap-3 overflow-y-auto p-6 text-left">
          <h1 className="text-lg font-bold text-[var(--color-tomato)]">Bir şeyler ters gitti</h1>
          <p className="text-sm text-[var(--color-ink-soft)]">
            {this.state.error?.message ?? String(this.state.error)}
          </p>
          <pre className="whitespace-pre-wrap rounded-lg bg-[var(--color-cream-dark)] p-3 text-[11px] text-[var(--color-ink-soft)]">
            {this.state.error?.stack}
          </pre>
          <button
            onClick={() => {
              localStorage.removeItem("tarifim-store");
              window.location.reload();
            }}
            className="mt-2 self-start rounded-full bg-[var(--color-paprika)] px-4 py-2 text-sm font-semibold text-[var(--color-cream)]"
          >
            Kayıtlı veriyi sıfırla ve yeniden başlat
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
