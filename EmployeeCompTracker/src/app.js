import * as d3 from 'd3';

export function createChart() {
    // Your D3 code here
    console.log('Creating D3 chart...');
    // Example: create a simple bar chart
    d3.select('body')
        .append('svg')
        .attr('width', 400)
        .attr('height', 200)
        .selectAll('rect')
        .data([50, 100, 150, 200])
        .enter()
        .append('rect')
        .attr('width', 50)
        .attr('height', d => d)
        .attr('x', (d, i) => i * 60)
        .attr('y', d => 200 - d)
        .attr('fill', 'blue');
}
console.log('App.js loaded');
