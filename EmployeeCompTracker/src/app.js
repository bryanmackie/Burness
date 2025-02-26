import * as d3 from 'd3';

const width = 500;
const height = 500;

const svg = d3.select('body').append('svg')
  .attr('width', width)
  .attr('height', height);

svg.append('circle')
  .attr('cx', width / 2)
  .attr('cy', height / 2)
  .attr('r', 50)
  .attr('fill', 'blue');