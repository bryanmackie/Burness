import * as d3 from 'd3';

export function createChart() {
    // Your D3 code here
    console.log('Creating D3 chart...');
    const data = [1, 2, 3, 4, 5];  // Example data
    const width = 400, height = 200;
    
    const svg = d3.select("#chartContainer")
                  .append("svg")
                  .attr("width", width)
                  .attr("height", height);
    
    // Example of creating bars for a bar chart
    svg.selectAll("rect")
       .data(data)
       .enter()
       .append("rect")
       .attr("x", (d, i) => i * 80)
       .attr("y", d => height - d * 30)
       .attr("width", 50)
       .attr("height", d => d * 30)
       .attr("fill", "blue");
}
console.log('App.js loaded');
