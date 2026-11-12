import { layer1 } from './layer1-glance.ts'
import { layer2 } from './layer2-branches.ts'
import { layer3 } from './layer3-lanes.ts'
import { layer4 } from './layer4-workshop.ts'
import { layer5 } from './layer5-blueprint.ts'
import type { LayerRenderer } from './types.ts'

export const LAYERS: LayerRenderer[] = [layer1, layer2, layer3, layer4, layer5]
