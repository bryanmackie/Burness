// app.js

import * as d3 from 'https://cdnjs.cloudflare.com/ajax/libs/d3/7.9.0/d3.min.js';
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