import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import './index.css';

// Last-resort error boundary: a render error shows a recoverable message
// instead of a blank screen.
class Boundary extends React.Component {
  state = { err: null };
  static getDerivedStateFromError(err) { return { err }; }
  render() {
    if (this.state.err)
      return (
        <div className="loading-state">
          Something went wrong rendering the dashboard.
          <button className="retry-btn" onClick={() => { location.hash = 'overview'; location.reload(); }}>Reload</button>
        </div>
      );
    return this.props.children;
  }
}

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <Boundary>
      <App />
    </Boundary>
  </React.StrictMode>
);
