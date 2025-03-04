// app.js

// Import D3 from a module-compatible CDN URL
import * as d3 from 'https://cdn.jsdelivr.net/npm/d3@7.9.0?module';

export function createChart() {
  const chartContainer = document.getElementById("chartContainer");
  console.log("Chart Container:", chartContainer);

  const svg = d3.select(chartContainer)
    .append('svg')
    .attr('width', 500)
    .attr('height', 500);

  svg.append('circle')
    .attr('cx', 250)
    .attr('cy', 250)
    .attr('r', 100)
    .style('fill', 'steelblue');
}