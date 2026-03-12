import * as d3 from 'd3';

declare module 'd3' {
  interface SVGSVGElement extends SVGElement {
    _zoom?: d3.ZoomBehavior<SVGSVGElement, unknown>;
  }
}
