 // app.js

export async function fetchHierarchy() {
  try {
    const response = await fetch('/get-hierarchy'); // API call to fetch the data
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
  // Select the container and retrieve its dimensions
  const container = d3.select("#hierarchyContainer");
  const width = container.node().getBoundingClientRect().width;
  // C: Total vertical height available (from CSS)
  const totalHeight = container.node().getBoundingClientRect().height;

  container.html(''); // Clear any existing tree

  // Create the SVG container using the CSS container dimensions
  const svg = container.append("svg")
    .attr("width", width)
    .attr("height", totalHeight);

  // Calculate total number of nodes across all trees
  const totalNodes = hierarchyData.reduce((sum, rootData) => {
    return sum + d3.hierarchy(rootData).descendants().length;
  }, 0);

  // Initialize a vertical offset for stacking trees
  let currentOffsetY = 0;

  hierarchyData.forEach((rootData) => {
    // Create the hierarchy for the current tree
    const root = d3.hierarchy(rootData);
    const numNodes = root.descendants().length;

    // Compute proportional height for this tree using the formula:
    // treeHeight = (totalHeight / totalNodes) * numNodes
    const treeHeight = (totalHeight / totalNodes) * numNodes;

    // Append a group for the tree, with a fixed horizontal offset (20px) and the calculated vertical offset
    const group = svg.append("g")
      .attr("transform", `translate(20, ${currentOffsetY})`);

    // Set up the D3 tree layout for this tree with the calculated height
    const treeLayout = d3.tree().size([treeHeight, width * 0.9]);
    treeLayout(root);

    // Render links between nodes
    group.selectAll('path.link')
      .data(root.links())
      .enter()
      .append('path')
      .attr('class', 'link')
      .attr('fill', 'none')
      .attr('stroke', '#ccc')
      .attr('d', d3.linkHorizontal()
        .x(d => d.y + 70) // Center the link horizontally (half of 140px rect width)
        .y(d => d.x + 20) // Center the link vertically (half of 40px rect height)
      );

    // Render nodes (and add drag behaviors)
    const node = group.selectAll('g.node')
      .data(root.descendants())
      .enter()
      .append('g')
      .attr('class', 'node')
      .attr('transform', d => `translate(${d.y}, ${d.x})`)
      .call(d3.drag()
        .on("start", dragStarted)
        .on("drag", dragged)
        .on("end", dragEnded)
      );

    // Append the rectangle for each node
    node.append('rect')
      .attr('width', 140)
      .attr('height', 40)
      .attr('rx', 10)
      .attr('ry', 10)
      .style('fill', '#fff')
      .style('stroke', 'steelblue')
      .style('stroke-width', 2);

    // Append text labels to the nodes
    node.append('text')
      .attr('dy', 3)
      .attr('x', 60)
      .attr('y', 20)
      .attr('text-anchor', 'middle')
      .style('font-size', '12px')
      .text(d => `${d.data.emp_first_name} ${d.data.emp_last_name}`);

    // Update the vertical offset for the next tree
    currentOffsetY += treeHeight;
  });

  // Drag event handlers
  function dragStarted(event, d) {
    d3.select(this).raise().classed("active", true);
    // Store starting positions
    d.startX = event.x;
    d.startY = event.y;
    // Get current transform values if present
    const transform = d3.select(this).attr("transform");
    if (transform) {
      const translate = transform.match(/translate\(([^)]+)\)/)[1].split(",");
      d.transformX = parseFloat(translate[0]);
      d.transformY = parseFloat(translate[1]);
    } else {
      d.transformX = 0;
      d.transformY = 0;
    }
  }

  function dragged(event, d) {
    // Update the node's position based on the movement delta
    const dx = event.x - d.startX;
    const dy = event.y - d.startY;
    d3.select(this).attr("transform", `translate(${d.transformX + dx}, ${d.transformY + dy})`);
  }

  async function dragEnded(event, d) {
    // Restore the rectangle's original stroke
    d3.select(this).select('rect').attr('stroke', 'steelblue');

    // Determine the drop position relative to the SVG container
    const svgElement = d3.select("svg").node();
    const point = svgElement.createSVGPoint();
    point.x = event.sourceEvent.clientX;
    point.y = event.sourceEvent.clientY;
    const dropPosition = point.matrixTransform(svgElement.getScreenCTM().inverse());
    console.log("Drop Position:", dropPosition);
    let targetSupervisor = null;

    // Loop over all nodes to detect the drop target
    d3.selectAll('.node').each(function(nodeData) {
      const rect = this.getBoundingClientRect(); // Get node dimensions
      const svgRect = svgElement.getBoundingClientRect(); // Get SVG's position on screen
      const nodeX = rect.x - svgRect.x;
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

      initInteractiveTree(); // Refresh the tree display after update
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
    renderInteractiveTree(data); // Pass data directly to render
  } catch (error) {
    console.error("Error initializing interactive tree:", error);
  }
}

export async function initSecondInteractiveTree() {
  try {
    const response = await fetch('/get-second-hierarchy');
    if (!response.ok) throw new Error('Failed to fetch hierarchy');
    const data = await response.json();
    // data.global and data.domestic hold the tree structures for each division

    // Clear container and prepare two divs or SVG groups
    const container = d3.select("#secondHierarchyContainer");
    container.html('');
    
    // Create two SVG containers side-by-side
    const containerWidth = container.node().getBoundingClientRect().width;
    const containerHeight = container.node().getBoundingClientRect().height;
    
    // Global SVG (left half)
    const globalSVG = container.append("svg")
      .attr("width", containerWidth / 2)
      .attr("height", containerHeight);
    
    // Domestic SVG (right half)
    const domesticSVG = container.append("svg")
      .attr("width", containerWidth / 2)
      .attr("height", containerHeight)
      .style("position", "absolute")
      .style("left", containerWidth / 2 + "px");

    // Render each tree
    renderTree(globalSVG, data.global);
    renderTree(domesticSVG, data.domestic);
    
  } catch (error) {
    console.error("Error initializing interactive tree:", error);
  }
}

function renderTree(svg, rootData) {
  // Create a hierarchy from the tree data.
  const root = d3.hierarchy(rootData, d => d.children);
  
  // Define a tree layout; adjust the size as needed.
  const treeLayout = d3.tree().size([svg.attr("height"), svg.attr("width") - 100]);
  treeLayout(root);

  // Render links
  svg.selectAll('path.link')
    .data(root.links())
    .enter()
    .append('path')
    .attr('class', 'link')
    .attr('fill', 'none')
    .attr('stroke', '#ccc')
    .attr('d', d3.linkHorizontal()
      .x(d => d.y + 50)
      .y(d => d.x)
    );

  // Render nodes
  const node = svg.selectAll('g.node')
    .data(root.descendants())
    .enter()
    .append('g')
    .attr('class', 'node')
    .attr('transform', d => `translate(${d.y}, ${d.x})`);

  // Draw rectangles for each node
  node.append('rect')
    .attr('width', 100)
    .attr('height', 30)
    .attr('rx', 5)
    .attr('ry', 5)
    .style('fill', d => d.depth === 0 ? '#f0f0f0' : '#fff')
    .style('stroke', 'steelblue')
    .style('stroke-width', 2);

  // Add text labels to nodes
  node.append('text')
    .attr('x', 50)
    .attr('y', 20)
    .attr('text-anchor', 'middle')
    .style('font-size', '12px')
    .text(d => {
      if (d.depth === 0) {
        // The root node displays the division (Global or Domestic)
        return d.data.label;
      } else {
        // Other nodes display the employee’s name
        return `${d.data.first_name} ${d.data.last_name}`;
      }
    });
}