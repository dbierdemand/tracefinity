'use client'

import { useState } from 'react'
import { ChevronRight, Info } from 'lucide-react'
import type { BinConfig } from '@/types'
import { NumericInput } from '@/components/NumericInput'
import { SectionHeader } from '@/components/SectionHeader'
import { createPartialBinsValues } from '@/lib/binDefaults'
import { maxGridUnitsForOtherAxis } from '@/lib/constants'
import { BED_SIZE_MAX_MM, BED_SIZE_MIN_MM } from '@/lib/settings'
import { cn } from '@/lib/utils'
import { ClassValue } from 'clsx'
import { useTheme } from '@/hooks/useTheme'

const GF_HEIGHT_UNIT = 7.0
// lip_d3 (1.2) + lip_d4 (2.6)
const LIP_NOTCH_DEPTH = 3.8
// depth floor at 1u height; every extra unit adds one height unit (7mm)
const MIN_CUTOUT_DEPTH = 1.5
// solid base height below the open shell interior
const GF_BASE_HEIGHT = 4.75
// minimum solid floor left under a flat-bottomed bin's pockets / shell cavity
const MIN_FLAT_FLOOR_DEPTH = 2.0
// floor plate thickness bounds (shelled mode)
const MIN_FLOOR_PLATE = 0.4
// Shell Depth slider snaps in 0.5mm increments
const SHELL_DEPTH_STEP = 0.5

export function calcMaxCutoutDepth(
  heightUnits: number,
  stackingLip: boolean,
  shelled: boolean = false,
  flatBottom: boolean = false,
): number {
  // shell mode has no lip-notch deduction: the lip collar is perimeter-only
  // geometry and never bounds the pocket depth (mirrors _max_pocket_depth)
  const lipDeduction = stackingLip && !shelled ? LIP_NOTCH_DEPTH : 0
  // a flat bottom has no feet, so the whole wall height is available and the
  // range is bounded by the physical limit: wall height less MIN_FLAT_FLOOR_DEPTH
  let depth = flatBottom
    ? GF_HEIGHT_UNIT * heightUnits - MIN_FLAT_FLOOR_DEPTH
    : MIN_CUTOUT_DEPTH + GF_HEIGHT_UNIT * (heightUnits - 1)
  depth -= lipDeduction
  return Math.max(MIN_CUTOUT_DEPTH, depth)
}

// Height of the solid material the interior is cut out of: the feet on a
// standard bin, nothing at all on a flat-bottomed bin.
function baseHeight(flatBottom: boolean): number {
  return flatBottom ? 0 : GF_BASE_HEIGHT
}

// Shell Depth is the complement of the floor plate thickness: the open
// cavity below the wall top. plate = wall_top - base_height - shell_depth.
function shellDepthToPlate(depth: number, heightUnits: number, flatBottom = false): number {
  return GF_HEIGHT_UNIT * heightUnits - baseHeight(flatBottom) - depth
}

function plateToShellDepth(plate: number, heightUnits: number, flatBottom = false): number {
  return GF_HEIGHT_UNIT * heightUnits - baseHeight(flatBottom) - plate
}

interface Props {
  config: BinConfig
  onChange: (config: BinConfig) => void
  autoSize?: boolean
  onAutoSizeChange?: (v: boolean) => void
}

function HelpTip({ text }: { text: string }) {
  return (
    <span className="group ml-1">
      <Info className="w-3 h-3 text-text-muted cursor-help inline-block" />
      <span className="absolute left-0 right-0 bottom-full mb-1.5 px-2 py-1.5 text-[11px] leading-tight text-text-primary bg-elevated border border-border-subtle rounded whitespace-normal opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity z-30 shadow-lg">
        {text}
      </span>
    </span>
  )
}

function Toggle({ checked, onChange, label, help, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; help?: string; disabled?: boolean }) {
  return (
    <div className={`relative flex items-center justify-between gap-3 py-2 ${disabled ? 'opacity-40 pointer-events-none' : ''}`}>
      <span className="min-w-0 text-xs text-text-primary tracking-[0.3px] leading-snug">
        {label}
        {help && <HelpTip text={help} />}
      </span>
      <button
        type="button"
        disabled={disabled}
        onClick={() => onChange(!checked)}
        aria-pressed={checked}
        className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${
          checked ? 'bg-accent' : 'bg-elevated'
        }`}
      >
        <span
          className={`inline-block h-3.5 w-3.5 rounded-full transition-transform ${
            checked ? 'translate-x-[19px]' : 'translate-x-[3px]'
          }`}
          style={{
            borderWidth: '1px',
            borderStyle: 'solid',
            borderColor: checked ? 'var(--color-accent)' : '#334155',
            backgroundColor: checked ? '#fff' : 'rgba(235,236,236,0.3)',
            boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
          }}
        />
      </button>
    </div>
  )
}

function SliderRow({
  label,
  value,
  min,
  max,
  step = 1,
  unit,
  help,
  onChange,
  disabled,
}: {
  label: string
  value: number
  min: number
  max: number
  step?: number
  unit?: string
  help?: string
  onChange: (v: number) => void
  disabled?: boolean
}) {
  const pct = ((value - min) / (max - min)) * 100

  return (
    <div className={`relative space-y-1.5 py-2 ${disabled ? 'opacity-40 pointer-events-none' : ''}`}>
      <span className="text-xs text-text-primary tracking-[0.3px]">
        {label}
        {help && <HelpTip text={help} />}
      </span>
      <div className="flex items-center gap-2">
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          disabled={disabled}
          onChange={(e) => {
            const v = step >= 1 ? parseInt(e.target.value) : parseFloat(e.target.value)
            onChange(v)
          }}
          className="flex-1 min-w-0"
          style={{ '--slider-pct': `${pct}%` } as React.CSSProperties}
        />
        <div className="flex items-center gap-1">
          <NumericInput
            min={min}
            max={max}
            step={step}
            value={value}
            disabled={disabled}
            onChange={onChange}
            className="w-14 h-7 bg-elevated text-right text-xs font-semibold text-text-primary rounded pr-2 focus:outline-none"
          />
          {unit && <span className="text-[10px] text-text-muted w-5">{unit}</span>}
        </div>
      </div>
    </div>
  )
}

function RadioMatrix({ sizeX, sizeY, values, onChange }: { sizeX: number; sizeY: number; values: boolean[]; onChange: (v: boolean[]) => void }) {
  let containerClasses: ClassValue = "gap-1 p-1 mx-1 rounded-md w-1/3";
  if (sizeX > 1) containerClasses = "gap-1 p-1 mx-1 rounded-sm w-1/2";
  if (sizeX > 2) containerClasses = "gap-1 p-1 mx-1 rounded-sm";
  if (sizeX > 4) containerClasses = "gap-px p-0 mx-0 rounded-sm";

  return (
      <div className={cn("grid bg-base p-2 mx-2 rounded-md", containerClasses)} style={{ gridTemplateColumns: `repeat(${sizeX}, 1fr)`, gridTemplateRows: `repeat(${sizeY}, 1fr)` }}>
          {values.map((value, index) => (
              <button
                  key={index}
                  onClick={() => {
                      if (value && values.filter(Boolean).length <= 1) return;
                      onChange(values.map((v, i) => (i === index ? !v : v)));
                  }}
                  className={cn("w-full border-2 aspect-square border-muted min-w-3", value ? "bg-accent border-accent" : "bg-elevated border-muted", sizeX > 4 ? "rounded-[2px]" : "rounded-sm")}
              ></button>
          ))}
      </div>
  );
}

function HintBanner({ children }: { children: React.ReactNode }) {
  const { theme } = useTheme()
  return (
    <div className={cn("text-[11px] mt-1 leading-tight", theme === 'dark' ? 'text-amber-400' : 'text-amber-600')}>
      {children}
    </div>
  )
}

// --- Collapsible sections -------------------------------------------------
// Collapse state is a pure view concern, so it follows the ad-hoc localStorage
// pattern already used by the home and project pages rather than living in
// lib/settings.ts (that store is a domain store round-tripped through the API).

const SECTIONS = ['size', 'cutouts', 'base', 'features', 'partial', 'print'] as const
type SectionId = (typeof SECTIONS)[number]

const SECTION_COLLAPSE_KEY = 'tracefinity.binConfigurator.collapsedSections'

// Only the everyday controls start open. Features, partial bins and print stay
// folded so a new bin opens on a short, scannable sidebar.
const DEFAULT_COLLAPSED: Record<SectionId, boolean> = {
  size: false,
  cutouts: false,
  base: false,
  features: true,
  partial: true,
  print: true,
}

function loadCollapsedSections(): Record<SectionId, boolean> {
  if (typeof window === 'undefined') return DEFAULT_COLLAPSED
  try {
    const raw = window.localStorage.getItem(SECTION_COLLAPSE_KEY)
    if (!raw) return DEFAULT_COLLAPSED
    const parsed = JSON.parse(raw) as Partial<Record<SectionId, boolean>>
    // merge over the defaults so newly added sections get a sane initial state
    return { ...DEFAULT_COLLAPSED, ...parsed }
  } catch {
    return DEFAULT_COLLAPSED
  }
}

function ConfigSection({
  id,
  title,
  collapsed,
  onToggle,
  summary,
  children,
}: {
  id: SectionId
  title: string
  collapsed: boolean
  onToggle: () => void
  /** Rendered in the header when folded, so hidden state stays legible. */
  summary?: string
  children: React.ReactNode
}) {
  return (
    <section className="border-t border-border mt-2 pt-1.5 first:border-t-0 first:mt-0 first:pt-0">
      <SectionHeader
        title={title}
        dense
        collapsed={collapsed}
        onToggleCollapsed={onToggle}
      >
        {summary && !collapsed && (
          <span className="text-[10px] text-text-muted truncate" title={summary}>
            {summary}
          </span>
        )}
      </SectionHeader>
      {!collapsed && <div className="space-y-0 pb-1">{children}</div>}
    </section>
  )
}

/**
 * Collapsible wrapper for a sub-group nested under a master toggle. The toggle
 * itself always stays visible; only the children fold away, behind a one-line
 * summary of the current values.
 */
function SubGroup({ summary, children }: { summary: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="pl-3 border-l border-border-subtle ml-1">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-1 py-1.5 text-left cursor-pointer group"
      >
        <ChevronRight className={cn(
          'w-3 h-3 flex-shrink-0 text-text-muted transition-transform',
          open && 'rotate-90',
        )} />
        <span className="text-[10px] text-text-muted group-hover:text-text-secondary truncate transition-colors">
          {summary}
        </span>
      </button>
      {open && <div className="space-y-0 pb-1">{children}</div>}
    </div>
  )
}

export function BinConfigurator({ config, onChange, autoSize, onAutoSizeChange }: Props) {
  const [collapsedSections, setCollapsedSections] = useState(loadCollapsedSections)

  function toggleSection(id: SectionId) {
    setCollapsedSections((prev) => {
      const next = { ...prev, [id]: !prev[id] }
      try {
        window.localStorage.setItem(SECTION_COLLAPSE_KEY, JSON.stringify(next))
      } catch {
        // private mode / quota — collapse state just won't persist
      }
      return next
    })
  }

  function update(partial: Partial<BinConfig>) {
    onChange({ ...config, ...partial })
  }

  const maxCutoutDepth = calcMaxCutoutDepth(config.height_units, config.stacking_lip, config.shelled, config.flat_bottom)
  // shell depth uses the same range rule as cutout depth: min 1.5mm, max
  // 1.5 + 7 × (height − 1) minus the lip notch when the stacking lip is on
  const shellDepthMin = MIN_CUTOUT_DEPTH
  const shellDepthMax = maxCutoutDepth
  const shellDepth = plateToShellDepth(config.shell_floor_plate, config.height_units, config.flat_bottom)
  const binWidth = config.grid_x * 42
  const binDepth = config.grid_y * 42
  const needsSplit = config.bed_size > 0 && (binWidth > config.bed_size || binDepth > config.bed_size)
  const exportsSeparateParts = config.partial_bins && !config.partial_bins_connect && config.partial_bins_values.some((enabled) => !enabled);

  return (
    <div className="space-y-0">
      <ConfigSection
        id="size"
        title="Size"
        collapsed={collapsedSections.size}
        onToggle={() => toggleSection('size')}
        summary={`${config.grid_x} x ${config.grid_y} u · ${config.height_units}u tall`}
      >
        {onAutoSizeChange && (
          <Toggle
            label="Auto-size grid"
            help="Automatically fit grid to placed tools. Turn off to set grid size manually."
            checked={!!autoSize}
            onChange={onAutoSizeChange}
          />
        )}

        <Toggle
          checked={config.half_grid_base}
          onChange={(v) => update({ half_grid_base: v, ...(v ? { magnets: false } : {}) })}
          label="Half-grid base"
          help="Use 21mm half-grid cells instead of standard 42mm for finer positioning. Auto-size snaps to these smaller cells, so the width and depth below grow in half steps. Works with a flat bottom too, where it still controls grid layout and snapping."
        />

        <SliderRow
          label="Grid Width"
        help="Bin width in gridfinity units (42mm each). Half-unit increments (21mm) supported."
        value={config.grid_x}
        min={1}
        max={maxGridUnitsForOtherAxis(config.grid_y)}
        step={0.5}
        unit="u"
        onChange={(v) =>
          update({
              grid_x: v,
              partial_bins_values: createPartialBinsValues(v, config.grid_y),
          })
        }
        disabled={autoSize}
      />

      <SliderRow
        label="Grid Depth"
        help="Bin depth in gridfinity units (42mm each). Half-unit increments (21mm) supported."
        value={config.grid_y}
        min={1}
        max={maxGridUnitsForOtherAxis(config.grid_x)}
        step={0.5}
        unit="u"
        onChange={(v) =>
          update({
              grid_y: v,
              partial_bins_values: createPartialBinsValues(config.grid_x, v),
          })
        }
        disabled={autoSize}
      />

      <SliderRow
        label="Height"
        help={
          config.flat_bottom
            ? "Bin height in gridfinity units. Each unit is 7mm, measured from the flat bottom."
            : "Bin height in gridfinity units. Each unit is 7mm, plus a 4.75mm base."
        }
        value={config.height_units}
        min={1}
        max={20}
        unit="u"
        onChange={(v) => {
          const newMax = calcMaxCutoutDepth(v, config.stacking_lip, config.shelled, config.flat_bottom)
          const depth = Math.min(Math.max(plateToShellDepth(config.shell_floor_plate, v, config.flat_bottom), MIN_CUTOUT_DEPTH), newMax)
          update({
            height_units: v,
            cutout_depth: Math.min(config.cutout_depth, newMax),
            shell_floor_plate: shellDepthToPlate(depth, v, config.flat_bottom),
          })
        }}
      />
      </ConfigSection>

      <ConfigSection
        id="cutouts"
        title="Cutouts"
        collapsed={collapsedSections.cutouts}
        onToggle={() => toggleSection('cutouts')}
        summary={`${Math.min(config.cutout_depth, maxCutoutDepth).toFixed(1)}mm deep`}
      >
        <SliderRow
        label="Cutout Depth"
        help={`How deep the tool pocket is cut into the bin. Range ${MIN_CUTOUT_DEPTH.toFixed(1)}–${maxCutoutDepth.toFixed(1)}mm at ${config.height_units}u height${config.stacking_lip && !config.shelled ? ' (with stacking lip)' : ''}${config.flat_bottom ? ` (flat bottom keeps ${MIN_FLAT_FLOOR_DEPTH.toFixed(1)}mm of floor)` : ''}.`}
        value={Math.min(config.cutout_depth, maxCutoutDepth)}
        min={MIN_CUTOUT_DEPTH}
        max={maxCutoutDepth}
        step={0.5}
        unit="mm"
        onChange={(v) => update({ cutout_depth: v })}
      />

      <SliderRow
        label="Clearance"
        help="Extra space around tool outlines. Increase if tools fit too tightly."
        value={config.cutout_clearance}
        min={0}
        max={5}
        step={0.1}
        unit="mm"
        onChange={(v) => update({ cutout_clearance: v })}
      />

      <SliderRow
        label="Cutout Chamfer"
        help="Bevel distance on the top edge of each tool pocket, in mm. 0 = sharp edge."
        value={config.cutout_chamfer}
        min={0}
        max={3}
        step={0.1}
        unit="mm"
        onChange={(v) => update({ cutout_chamfer: v })}
      />
      </ConfigSection>

      <ConfigSection
        id="base"
        title="Base"
        collapsed={collapsedSections.base}
        onToggle={() => toggleSection('base')}
      >
        <Toggle
          checked={config.flat_bottom}
          onChange={(v) => {
            const newMax = calcMaxCutoutDepth(config.height_units, config.stacking_lip, config.shelled, v)
            // the 4.75mm the feet occupied becomes usable interior depth, so
            // re-express the shell floor against the new base height
            const depth = Math.min(Math.max(plateToShellDepth(config.shell_floor_plate, config.height_units, v), MIN_CUTOUT_DEPTH), newMax)
            update({
              flat_bottom: v,
              ...(v ? { magnets: false } : {}),
              cutout_depth: Math.min(config.cutout_depth, newMax),
              shell_floor_plate: shellDepthToPlate(depth, config.height_units, v),
            })
          }}
          label="Flat Bottom"
          help="Replaces the gridfinity feet with a flat underside, chamfered 0.7mm at 45° along the bottom edge, so the bin rests directly on a surface instead of a baseplate. The grid width and depth are unchanged, so it still occupies the same cells. The 4.75mm the feet used is repurposed for deeper tool cutouts and shell interiors, while at least 2mm of solid floor is kept. Magnet holes are not available without feet."
        />
        {config.flat_bottom && (
          <p className="text-[11px] text-text-muted mt-0.5 leading-tight pl-0.5">
            No feet, so this bin cannot be attached to a Gridfinity baseplate
          </p>
        )}
        <Toggle
          checked={config.magnets && !config.half_grid_base && !config.flat_bottom}
          onChange={(v) => update({ magnets: v })}
          label="Magnet holes"
          help="Holes in the base for magnets. Keeps bins locked to the baseplate."
          disabled={config.half_grid_base || config.flat_bottom}
        />
        {config.half_grid_base && !config.flat_bottom && (
          <p className="text-[11px] text-text-muted mt-0.5 leading-tight pl-0.5">
            Magnet holes are not compatible with half-grid base cells
          </p>
        )}
        {config.magnets && !config.half_grid_base && !config.flat_bottom && (
          <SubGroup
            summary={
              config.magnet_corners_only
                ? `${config.magnet_diameter}mm · ${config.magnet_depth}mm deep · corners only`
                : `${config.magnet_diameter}mm · ${config.magnet_depth}mm deep`
            }
          >
            <SliderRow
              label="Diameter"
              help="Magnet diameter in mm. Must match the magnets seated in your baseplate."
              value={config.magnet_diameter}
              min={3}
              max={10}
              step={0.5}
              unit="mm"
              onChange={(v) => update({ magnet_diameter: v })}
            />
            <SliderRow
              label="Depth"
              help="How deep the hole is drilled, in mm. Deep enough to seat a magnet flush with the base surface."
              value={config.magnet_depth}
              min={1}
              max={5}
              step={0.1}
              unit="mm"
              onChange={(v) => update({ magnet_depth: v })}
            />
            <Toggle
              checked={config.magnet_corners_only}
              onChange={(v) => update({ magnet_corners_only: v })}
              label="Corners only"
              help="Only place magnet holes at the 4 outer corners of the bin."
            />
          </SubGroup>
        )}
      </ConfigSection>

      <ConfigSection
        id="features"
        title="Features"
        collapsed={collapsedSections.features}
        onToggle={() => toggleSection('features')}
        summary={[
          config.stacking_lip ? (config.rim_units > 0 ? `lip +${config.rim_units}u` : 'lip on') : null,
          config.shelled ? 'shell on' : null,
          config.insert_enabled ? 'insert on' : null,
        ].filter(Boolean).join(' · ') || 'none enabled'}
      >
        <Toggle
          checked={config.stacking_lip}
          onChange={(v) => {
            const newMax = calcMaxCutoutDepth(config.height_units, v, config.shelled, config.flat_bottom)
            update({
              stacking_lip: v,
              rim_units: v ? config.rim_units : 0,
              // the stacking lip needs the outer wall band to sit on
              shell_exterior_wall: v ? true : config.shell_exterior_wall,
              cutout_depth: Math.min(config.cutout_depth, newMax),
            })
          }}
          label="Stacking lip"
          help="Raised rim at the top so bins can stack securely on top of each other."
        />
        {config.stacking_lip && (
          <SubGroup summary={config.rim_units > 0 ? `raised ${config.rim_units}u` : 'standard height'}>
            <SliderRow
              label="Raise Lip"
              help="Extends the wall and lip this many units (7mm each) above the floor face, leaving the interior open. Lets a tool protrude above the floor while a stacked bin still clears it. 0 = standard."
              value={config.rim_units}
              min={0}
              max={10}
              unit="u"
              onChange={(v) => update({ rim_units: v })}
            />
          </SubGroup>
        )}
        <Toggle
          checked={config.shelled}
          onChange={(v) => {
            const maxDepth = calcMaxCutoutDepth(config.height_units, config.stacking_lip, true, config.flat_bottom)
            const depth = Math.min(Math.max(plateToShellDepth(config.shell_floor_plate, config.height_units, config.flat_bottom), MIN_CUTOUT_DEPTH), maxDepth)
            update({
              shelled: v,
              wall_thickness: v ? Math.min(3, Math.max(1, config.wall_thickness)) : 1.6,
              shell_floor_plate: v ? shellDepthToPlate(depth, config.height_units, config.flat_bottom) : 0.75,
            })
          }}
          label="Shell"
          help="Builds the bin as a constant-thickness shell: walls around the tools and around the outside, with the top surface open between them. Saves filament and print time. With the standard base a thin floor above the feet seals the bottom."
        />
        {config.shelled && (
          <SubGroup
            summary={`${config.wall_thickness}mm walls · ${Math.min(Math.max(shellDepth, shellDepthMin), shellDepthMax).toFixed(1)}mm deep`}
          >
            <SliderRow
              label="Wall Thickness"
              help="Thickness of the shell walls."
              value={config.wall_thickness}
              min={1}
              max={3}
              step={0.2}
              unit="mm"
              onChange={(v) => update({ wall_thickness: v })}
            />
            <SliderRow
              label="Shell Depth"
              help={`How deep the open shell interior extends below the wall top; the rest seals as a floor plate. Range ${shellDepthMin.toFixed(1)}–${shellDepthMax.toFixed(1)}mm at ${config.height_units}u height${config.stacking_lip ? ' (with stacking lip)' : ''}.`}
              value={Math.min(Math.max(shellDepth, shellDepthMin), shellDepthMax)}
              min={shellDepthMin}
              max={shellDepthMax}
              step={SHELL_DEPTH_STEP}
              unit="mm"
              onChange={(v) => {
                const plate = Math.max(shellDepthToPlate(v, config.height_units, config.flat_bottom), MIN_FLOOR_PLATE)
                update({ shell_floor_plate: plate })
              }}
            />
            <Toggle
              checked={config.stacking_lip ? true : config.shell_exterior_wall}
              onChange={(v) => update({ shell_exterior_wall: v })}
              label="Exterior Wall"
              disabled={config.stacking_lip}
              help="Builds the outer wall band around the bin perimeter. Turn off to drop it, leaving the perimeter flush at the trench floor height with only the tool walls standing. Locked on while Stacking lip is enabled — the lip needs a wall to sit on."
            />
            {(config.shell_exterior_wall || config.stacking_lip) && (
              <Toggle
                checked={config.shell_exterior_standard}
                onChange={(v) => update({ shell_exterior_standard: v })}
                label="Gridfinity Standard Exterior"
                help="Keeps the standard stacking-lip profile at the top so bins stack with any gridfinity bin. Off runs the shell thickness all the way up through the lip (minimum filament, non-standard stacking)."
              />
            )}
          </SubGroup>
        )}
        <Toggle
          checked={config.insert_enabled}
          onChange={(v) => update({ insert_enabled: v })}
          label="Contrast Insert"
          help="Generates a separate insert STL to print in a contrasting colour. The pocket is deepened to accommodate it."
        />
        {config.insert_enabled && (
          <SubGroup summary={`${config.insert_height}mm thick · ${config.insert_clearance}mm fit`}>
            <SliderRow
              label="Insert Height"
              help="Thickness of the insert in mm."
              value={config.insert_height}
              min={0.5}
              max={10}
              step={0.1}
              unit="mm"
              onChange={(v) => update({ insert_height: v })}
            />
            <SliderRow
              label="Insert Fit"
              help="Clearance shaved off the insert edges so it drops into the pocket."
              value={config.insert_clearance}
              min={0}
              max={1}
              step={0.05}
              unit="mm"
              onChange={(v) => update({ insert_clearance: v })}
            />
          </SubGroup>
        )}
      </ConfigSection>

      <ConfigSection
        id="partial"
        title="Partial bins"
        collapsed={collapsedSections.partial}
        onToggle={() => toggleSection('partial')}
      >
          <Toggle
              checked={config.partial_bins}
              onChange={(v) =>
                  update({
                      partial_bins: v,
                      ...(!v ? { partial_bins_connect: false, partial_bins_retain_wall: false } : {}),
                  })
              }
              label="Partial Bins"
              help="Print only parts of the bin that are needed to hold the tools."
          />
          {config.partial_bins && (
              <SubGroup summary={
                config.partial_bins_values.filter(Boolean).length === config.partial_bins_values.length
                  ? 'all cells'
                  : `${config.partial_bins_values.filter(Boolean).length} of ${config.partial_bins_values.length} cells${config.partial_bins_connect ? ' · connected' : ''}`
              }>
                  <RadioMatrix sizeX={Math.ceil(config.grid_x)} sizeY={Math.ceil(config.grid_y)} values={config.partial_bins_values} onChange={(v) => update({ partial_bins_values: v })} />
                  <Toggle
                      checked={config.partial_bins_connect}
                      onChange={(v) =>
                          update({
                              partial_bins_connect: v,
                              ...(!v ? { partial_bins_retain_wall: false } : {}),
                          })
                      }
                      label="Connect base"
                      help="Remove walls in disabled cells, bridge them with a thin base plate, and keep one connected print."
                  />
                  {config.partial_bins_connect && (
                      <Toggle
                          checked={config.partial_bins_retain_wall}
                          onChange={(v) => update({ partial_bins_retain_wall: v })}
                          label="Retain outer wall"
                          help="Keep the bin perimeter wall through disabled cells while still connecting them on the base."
                      />
                  )}
                  {exportsSeparateParts && <HintBanner>Disconnected pieces {"\u2014"} export includes a ZIP with one STL per part</HintBanner>}
              </SubGroup>
          )}
      </ConfigSection>

      <ConfigSection
        id="print"
        title="Print"
        collapsed={collapsedSections.print}
        onToggle={() => toggleSection('print')}
        summary={`${config.bed_size}mm bed`}
      >
        <SliderRow
          label="Bed Size"
          help="Print bed size. Bins wider than this are automatically split into pieces."
          value={config.bed_size}
          min={BED_SIZE_MIN_MM}
          max={BED_SIZE_MAX_MM}
          step={1}
          unit="mm"
          onChange={(v) => update({ bed_size: v })}
        />
        {needsSplit && (
          <HintBanner>
            {binWidth > config.bed_size && `Width ${binWidth}mm exceeds bed`}
            {binWidth > config.bed_size && binDepth > config.bed_size && ' & '}
            {binDepth > config.bed_size && `Depth ${binDepth}mm exceeds bed`}
            {' \u2014 will be split'}
          </HintBanner>
        )}
      </ConfigSection>
    </div>
  )
}
