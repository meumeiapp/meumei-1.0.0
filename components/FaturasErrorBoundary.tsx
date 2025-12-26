import React from 'react';

type Props = React.PropsWithChildren<unknown>;

type State = {
  hasError: boolean;
};

export default class FaturasErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error) {
    console.error('[Faturas] render error', error);
  }

  render() {
    if (this.state.hasError) {
      return null;
    }
    return this.props.children;
  }
}
