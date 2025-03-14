


export async function fetchHierarchy() {
  try {
    const response = await fetch('/get-hierarchy'); // This is your API call to fetch the data
    if (!response.ok) {
      throw new Error('Failed to fetch hierarchy');
    }

    const data = await response.json();  // Parse the response as JSON
    return data;  // Return the fetched hierarchy data
  } catch (error) {
    console.error("Error fetching hierarchy:", error);
    document.getElementById("hierarchyContainer").innerText = 'Error fetching data.';  // Display an error message if fetching fails
  }
}

export function renderInteractiveTree(hierarchyData) {
  // Set dimensions for the tree
  const container = d3.select("#hierarchyContainer");
  const width = container.node().getBoundingClientRect().width;
const height = container.node().getBoundingClientRect().height;

  container.html(''); // Clear any existing tree

  const svg = container.append("svg")
    .attr("width", width)
    .attr("height", height);
     // Calculate total number of nodes across all trees
  const totalNodes = hierarchyData.reduce((sum, rootData) => sum + d3.hierarchy(rootData).descendants().length, 0);

  let currentOffsetY = 0; // Tracks vertical position

  hierarchyData.forEach((rootData) => {
    const root = d3.hierarchy(rootData);
    const numNodes = root.descendants().length;

    // Compute proportional spacing
    const treeHeight = (totalHeight / totalNodes) * numNodes;

    const group = svg.append("g")
      .attr("transform", `translate(20, ${currentOffsetY})`); // Offset X slightly

    const treeLayout = d3.tree().size([treeHeight, width * 0.9]);
    treeLayout(root);

    // Render links
    group.selectAll('path.link')
      .data(root.links())
      .enter()
      .append('path')
      .attr('class', 'link')
      .attr('fill', 'none')
      .attr('stroke', '#ccc')
      .attr('d', d3.linkHorizontal()
        .x(d => d.y + 120 / 2)
        .y(d => d.x + 40 / 2));
  
    // Render nodes
    const node = group.selectAll('g.node')
      .data(root.descendants())
      .enter()
      .append('g')
      .attr('class', 'node')
      .attr('transform', d => `translate(${d.y},${d.x})`)
      .call(d3.drag()
        .on("start", dragStarted)
        .on("drag", dragged)
        .on("end", dragEnded)
      );
  
    node.append('rect')
      .attr('width', 120)
      .attr('height', 40)
      .attr('rx', 10)
      .attr('ry', 10)
      .style('fill', '#fff')
      .style('stroke', 'steelblue')
      .style('stroke-width', 2);
  
    node.append('text')
      .attr('dy', 3)
      .attr('x', 60)
      .attr('y', 20)
      .attr('text-anchor', 'middle')
      .style('font-size', '12px')
      .text(d => `${d.data.emp_first_name} ${d.data.emp_last_name}`);
  });
  // Define drag event handlers
  function dragStarted(event, d) {
    d3.select(this).raise().classed("active", true);
  
    // Store the original positions to calculate the relative movement
    d.startX = event.x;
    d.startY = event.y;
    d.transformX = d3.select(this).attr("transform") ? 
                   parseFloat(d3.select(this).attr("transform").split("(")[1].split(",")[0]) : 0;
    d.transformY = d3.select(this).attr("transform") ? 
                   parseFloat(d3.select(this).attr("transform").split("(")[1].split(",")[1]) : 0;
  }
  
  function dragged(event, d) {
    // Update node position based on the delta movement
    const dx = event.x - d.startX;
    const dy = event.y - d.startY;
    
    d3.select(this).attr("transform", `translate(${d.transformX + dx}, ${d.transformY + dy})`);
  }
  async function dragEnded(event, d) {
    // Restore original styling
    d3.select(this).select('rect').attr('stroke', 'steelblue');

    // Get the drop position relative to the SVG container
    const svg = d3.select("svg").node();
    const point = svg.createSVGPoint();
    point.x = event.sourceEvent.clientX;
    point.y = event.sourceEvent.clientY;
    const dropPosition = point.matrixTransform(svg.getScreenCTM().inverse());
    console.log("Drop Position:", dropPosition); // Debugging log
    let targetSupervisor = null;

    // Loop over all nodes to detect the drop target
    d3.selectAll('.node').each(function(nodeData) {
        const rect = this.getBoundingClientRect(); // More reliable than getBBox()
        const svgRect = svg.getBoundingClientRect(); // Get SVG position on screen
        const nodeX = rect.x - svgRect.x; // Adjust for SVG position
        const nodeY = rect.y - svgRect.y;

        if (
            dropPosition.x >= nodeX &&
            dropPosition.x <= nodeX + rect.width &&
            dropPosition.y >= nodeY &&
            dropPosition.y <= nodeY + rect.height &&
            nodeData.data.emp_id !== d.data.emp_id
        ) {
            targetSupervisor = nodeData;
            console.log("Found target supervisor:", targetSupervisor.data.emp_first_name);
        }
    });

    if (targetSupervisor) {
      console.log(`Updating supervisor for ${d.data.emp_first_name}`);
        const confirmChange = confirm(`Are you sure you want to change ${d.data.emp_first_name} ${d.data.emp_last_name}'s supervisor to ${targetSupervisor.data.emp_first_name} ${targetSupervisor.data.emp_last_name}?`);
        
        if (!confirmChange) {
            console.log("Supervisor change canceled.");
            return;
        }

        console.log(`Dropped on: ${targetSupervisor.data.emp_first_name} ${targetSupervisor.data.emp_last_name}`);

        await updateSupervisorInDatabase(d.data.emp_id, {
            new_sup_id: targetSupervisor.data.emp_id,
            new_sup_first_name: targetSupervisor.data.emp_first_name,
            new_sup_last_name: targetSupervisor.data.emp_last_name
        });

        initInteractiveTree();
    } else {
        console.warn("No valid drop target found. Supervisor not updated.");
    }
}



}



export async function updateSupervisorInDatabase(empId, newSupervisorData) {
  try {
    const response = await fetch('/update-supervisor', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({
        emp_id: empId,
        sup_id: newSupervisorData.new_sup_id,
        sup_first_name: newSupervisorData.new_sup_first_name,
        sup_last_name: newSupervisorData.new_sup_last_name
      })
    });
    const result = await response.json();
    if (!result.success) {
      throw new Error(result.message);
    }
    return result;
  } catch (error) {
    console.error('Error updating supervisor in database:', error);
  }
}

export async function initInteractiveTree() {
  try {
    const data = await fetchHierarchy();
    console.log("Hierarchy received from server:", data);
    renderInteractiveTree(data); // Pass data directly
  } catch (error) {
    console.error("Error initializing interactive tree:", error);
  }
}
