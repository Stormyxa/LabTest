/**
 * Blur utility functions for consistent blur effects across the application
 */

export const createBlurOverlay = (opacity = 0.7, zIndex = 999) => ({
  position: 'fixed',
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  background: `rgba(0, 0, 0, ${opacity})`,
  zIndex,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '20px'
});

export const createModalOverlay = (zIndex = 1000) => ({
  position: 'fixed',
  inset: 0,
  background: 'rgba(0, 0, 0, 0.85)',
  backdropFilter: 'blur(10px)',
  zIndex
});

export const createSidebarOverlay = () => ({
  position: 'fixed',
  inset: 0,
  background: 'rgba(0, 0, 0, 0.4)',
  backdropFilter: 'blur(2px)',
  zIndex: 999,
  opacity: 0,
  visibility: 'hidden'
});
