'use client'
import { useEffect, useRef, useMemo } from 'react'
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'

gsap.registerPlugin(ScrollTrigger)

interface ScrollRevealProps {
  children: string
  enableBlur?: boolean
  baseOpacity?: number
  baseRotation?: number
  blurStrength?: number
  containerClassName?: string
  textClassName?: string
  rotationEnd?: string
  wordAnimationEnd?: string
  as?: 'h1' | 'h2' | 'h3' | 'p'
}

const ScrollReveal = ({
  children,
  enableBlur = true,
  baseOpacity = 0.08,
  baseRotation = 2,
  blurStrength = 5,
  containerClassName = '',
  textClassName = '',
  rotationEnd = 'bottom bottom',
  wordAnimationEnd = 'bottom bottom',
  as: Tag = 'h2',
}: ScrollRevealProps) => {
  const containerRef = useRef<HTMLElement>(null)

  const splitText = useMemo(() => {
    return children.split(/(\s+)/).map((word, index) => {
      if (word.match(/^\s+$/)) return word
      return (
        <span
          key={index}
          style={{ display: 'inline-block' }}
          className="sr-word"
        >
          {word}
        </span>
      )
    })
  }, [children])

  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    gsap.fromTo(
      el,
      { transformOrigin: '0% 50%', rotate: baseRotation },
      {
        ease: 'none',
        rotate: 0,
        scrollTrigger: { trigger: el, start: 'top bottom', end: rotationEnd, scrub: true },
      }
    )

    const wordElements = el.querySelectorAll('.sr-word')

    gsap.fromTo(
      wordElements,
      { opacity: baseOpacity, willChange: 'opacity' },
      {
        ease: 'none',
        opacity: 1,
        stagger: 0.05,
        scrollTrigger: { trigger: el, start: 'top bottom-=20%', end: wordAnimationEnd, scrub: true },
      }
    )

    if (enableBlur) {
      gsap.fromTo(
        wordElements,
        { filter: `blur(${blurStrength}px)` },
        {
          ease: 'none',
          filter: 'blur(0px)',
          stagger: 0.05,
          scrollTrigger: { trigger: el, start: 'top bottom-=20%', end: wordAnimationEnd, scrub: true },
        }
      )
    }

    return () => { ScrollTrigger.getAll().forEach(t => t.kill()) }
  }, [children, enableBlur, baseRotation, baseOpacity, rotationEnd, wordAnimationEnd, blurStrength])

  return (
    <Tag
      ref={containerRef as any}
      className={containerClassName}
    >
      <span className={textClassName}>{splitText}</span>
    </Tag>
  )
}

export default ScrollReveal
