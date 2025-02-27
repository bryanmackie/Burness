import * as d3 from 'd3';

// Create a simple bar chart
const data = [30, 50, 80, 120, 150];

const width = 500;
const height = 300;

const svg = d3.select('body').append('svg')
  .attr('width', width)
  .attr('height', height);

svg.selectAll('rect')
  .data(data)
  .enter().append('rect')
  .attr('x', (d, i) => i * 100)  // Position each bar
  .attr('y', d => height - d)    // Height of each bar
  .attr('width', 80)
  .attr('height', d => d)
  .attr('fill', 'blue');