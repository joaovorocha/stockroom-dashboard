import React from 'react';
import { Link } from 'react-router-dom';

const QuickAccessTile = ({ to, icon, title, subtitle, onClick, style, className = '' }) => {
  const tileContent = (
    <>
      <div className="app-tile-icon">{icon}</div>
      <div className="app-tile-text">
        <div className="app-tile-title">{title}</div>
        <div className="app-tile-subtitle">{subtitle}</div>
      </div>
    </>
  );

  if (onClick) {
    return (
      <a
        href="#"
        className={`app-tile ${className}`}
        onClick={onClick}
        style={style}
      >
        {tileContent}
      </a>
    );
  }

  return (
    <Link to={to} className={`app-tile ${className}`} style={style}>
      {tileContent}
    </Link>
  );
};

export default QuickAccessTile;
