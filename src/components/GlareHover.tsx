'use client'

interface GlareHoverProps {
  children: React.ReactNode
  background?: string
  borderRadius?: string
  borderColor?: string
  glareColor?: string
  glareOpacity?: number
  glareAngle?: number
  glareSize?: number
  transitionDuration?: number
  playOnce?: boolean
  className?: string
  style?: React.CSSProperties
  width?: string
  height?: string
}

const GlareHover = ({
  children,
  background = 'transparent',
  borderRadius = '16px',
  borderColor = 'transparent',
  glareColor = '#ffffff',
  glareOpacity = 0.18,
  glareAngle = -45,
  glareSize = 250,
  transitionDuration = 600,
  playOnce = false,
  className = '',
  style = {},
  width = '100%',
  height = '100%',
}: GlareHoverProps) => {
  const hex = glareColor.replace('#', '')
  let rgba = glareColor
  if (/^[0-9A-Fa-f]{6}$/.test(hex)) {
    const r = parseInt(hex.slice(0, 2), 16)
    const g = parseInt(hex.slice(2, 4), 16)
    const b = parseInt(hex.slice(4, 6), 16)
    rgba = `rgba(${r}, ${g}, ${b}, ${glareOpacity})`
  }

  const vars = {
    '--gh-width': width,
    '--gh-height': height,
    '--gh-bg': background,
    '--gh-br': borderRadius,
    '--gh-angle': `${glareAngle}deg`,
    '--gh-duration': `${transitionDuration}ms`,
    '--gh-size': `${glareSize}%`,
    '--gh-rgba': rgba,
    '--gh-border': borderColor,
  } as React.CSSProperties

  return (
    <div
      className={`glare-hover${playOnce ? ' glare-hover--play-once' : ''}${className ? ' ' + className : ''}`}
      style={{ ...vars, ...style }}
    >
      {children}
    </div>
  )
}

export default GlareHover
