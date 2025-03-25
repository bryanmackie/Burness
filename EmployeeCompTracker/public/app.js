 // app.js
 function translate(x, y) {
  return `translate(${x}, ${y})`;
}

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
/**
 * Custom recursive function to assign positions.
 * If all children of a node are leaves, they are stacked vertically.
 * Otherwise, they are spaced horizontally.
 */
function assignPositions(node, hSpacing, vSpacing) {
  if (node.children) {
    // Check if all children are leaves.
    const allLeaves = node.children.every(child => !child.children);
    
    if (allLeaves) {
      // Vertical stacking: maintain parent's x with a small horizontal offset.
      node.children.forEach((child, i) => {
        child.x = node.x + 30;  // slight horizontal offset
        child.y = node.y + vSpacing * (i + 1);
        assignPositions(child, hSpacing, vSpacing);
      });
    } else {
      // Horizontal spacing: spread out children.
      node.children.forEach((child, i) => {
        child.x = node.x + hSpacing * (i + 1); // spread horizontally
        child.y = node.y + vSpacing;           // common vertical offset
        assignPositions(child, hSpacing, vSpacing);
      });
    }
  }
}

export async function initSecondInteractiveTree() {
  console.log("Initializing second interactive tree...");
  try {
    const response = await fetch('/get-second-hierarchy');
    if (!response.ok) throw new Error('Failed to fetch hierarchy');
    const data = await response.json();
    console.log("Second hierarchy data received:", data);
    // data.global and data.domestic hold the tree structures for each division

    // Clear container and prepare two SVG groups.
    const container = d3.select("#secondHierarchyContainer");
    container.html('');
    
    const containerWidth = container.node().getBoundingClientRect().width;
    const containerHeight = container.node().getBoundingClientRect().height;
    
    // Global SVG (left side)
    const globalSVG = container.append("svg")
      .attr("width", containerWidth / 3)
      .attr("height", containerHeight);
    
    // Domestic SVG (right side)
    const domesticSVG = container.append("svg")
      .attr("width", containerWidth * 2 / 3)
      .attr("height", containerHeight)
      .style("position", "absolute")
      .style("left", containerWidth / 3 + "px");

    console.log("Rendering Global tree...");
    renderTree(globalSVG, data.global);
    console.log("Rendering Domestic tree...");
    renderTree(domesticSVG, data.domestic);
    
  } catch (error) {
    console.error("Error initializing second interactive tree:", error);
  }
}

function renderTree(svg, rootData) {
  // Create a hierarchy from the tree data.
  const root = d3.hierarchy(rootData, d => d.children);
  
  const svgWidth = parseInt(svg.attr("width"), 10);
  const svgHeight = parseInt(svg.attr("height"), 10);
  
  // Set the initial position of the root.
  // Here we center the root horizontally and give a small top margin.
  root.x = svgWidth / 2;
  root.y = 20; // top margin

  // Define spacing parameters.
  const horizontalSpacing = 120; // for intermediate (non-leaf) levels
  const verticalSpacing = 60;    // for leaf-level stacking
  
  // Recursively assign positions.
  assignPositions(root, horizontalSpacing, verticalSpacing);

  // Render links using d3.linkVertical.
  svg.selectAll('path.link')
    .data(root.links())
    .enter()
    .append('path')
    .attr('class', 'link')
    .attr('fill', 'none')
    .attr('stroke', '#ccc')
    .attr('d', d3.linkVertical()
      .x(d => d.x)
      .y(d => d.y)
    );

  // Render nodes.
  const node = svg.selectAll('g.node')
    .data(root.descendants())
    .enter()
    .append('g')
    .attr('class', 'node')
    .attr('transform', d => translate(d.x, d.y))
    .call(d3.drag()
      .on("start", dragStarted)
      .on("drag", dragged)
      .on("end", dragEnded)
    );

  // Draw rectangles for each node.
  node.append('rect')
    .attr('width', 100)
    .attr('height', 30)
    .attr('x', -50)  // center the rectangle horizontally
    .attr('y', -15)  // center vertically
    .attr('rx', 5)
    .attr('ry', 5)
    .style('fill', d => d.depth === 0 ? '#f0f0f0' : '#fff')
    .style('stroke', 'steelblue')
    .style('stroke-width', 2);

  // Add text labels to nodes.
  node.append('text')
    .attr('text-anchor', 'middle')
    .attr('dy', '0.35em')
    .style('font-size', '12px')
    .text(d => {
      if (d.depth === 0) {
        return d.data.label;  // root node shows division label
      } else {
        return `${d.data.first_name} ${d.data.last_name}`;
      }
    });

  // --- Drag Handlers ---
  function dragStarted(event, d) {
    d3.select(this).raise().classed("active", true);
    // Save the starting positions.
    d.startX = event.x;
    d.startY = event.y;
    const transform = d3.select(this).attr("transform");
    if (transform) {
      const values = transform.match(/translate\(([^)]+)\)/)[1].split(",");
      d.transformX = parseFloat(values[0]);
      d.transformY = parseFloat(values[1]);
    } else {
      d.transformX = 0;
      d.transformY = 0;
    }
  }

  function dragged(event, d) {
    const dx = event.x - d.startX;
    const dy = event.y - d.startY;
    d3.select(this).attr("transform", translate(d.transformX + dx, d.transformY + dy));
  }

  async function dragEnded(event, d) {
    d3.select(this).select('rect').attr('stroke', 'steelblue');

    // Determine the drop position relative to the SVG container.
    const svgElement = d3.select("svg").node();
    const point = svgElement.createSVGPoint();
    point.x = event.sourceEvent.clientX;
    point.y = event.sourceEvent.clientY;
    const dropPosition = point.matrixTransform(svgElement.getScreenCTM().inverse());
    console.log("Drop Position:", dropPosition);
    let targetNode = null;

    // Loop over all nodes to detect the drop target.
    d3.selectAll('.node').each(function(nodeData) {
      // Exclude the dragged node itself.
      if (nodeData === d) return;
      
      const rect = this.getBoundingClientRect();
      const svgRect = svgElement.getBoundingClientRect();
      const nodeX = rect.x - svgRect.x;
      const nodeY = rect.y - svgRect.y;

      if (
        dropPosition.x >= nodeX &&
        dropPosition.x <= nodeX + rect.width &&
        dropPosition.y >= nodeY &&
        dropPosition.y <= nodeY + rect.height
      ) {
        targetNode = nodeData;
        console.log("Found target node:", targetNode.data);
      }
    });

    if (targetNode) {
      // If the target node's label is "Domestic" or "Global", update department and clear supervisor fields.
      if (targetNode.data.label === "Domestic" || targetNode.data.label === "Global") {
        const confirmChange = confirm(`Update department to ${targetNode.data.label}?`);
        if (!confirmChange) return;
        console.log(`Updating department to ${targetNode.data.label} for ${d.data.first_name}`);
        await updateSupervisorInDatabase(
          d.data.first_name,
          d.data.last_name,
          targetNode.data.label.toLowerCase(),
          null,
          null
        );
      } else {
        // Otherwise, update using the target node's department and supervisor info.
        const confirmChange = confirm(`Update department to ${targetNode.data.department} and direct supervisor to ${targetNode.data.first_name} ${targetNode.data.last_name}?`);
        if (!confirmChange) return;
        console.log(`Updating department to ${targetNode.data.department} for ${d.data.first_name}`);
        await updateSupervisorInDatabase(
          d.data.first_name,
          d.data.last_name,
          targetNode.data.department,
          targetNode.data.first_name,
          targetNode.data.last_name
        );
      }
    } else {
      console.warn("No valid drop target found. Update cancelled.");
    }
  }
}

/**
 * Posts the updated node information to the server.
 * The payload includes:
 * - dragged_first_name & dragged_last_name (to identify the record in emailaid)
 * - target_department (the new department value)
 * - target_first_name & target_last_name (the new direct supervisor; if null, those fields are cleared)
 */
export async function updateSupervisorInDatabase(dragged_first_name, dragged_last_name, target_department, target_first_name, target_last_name) {
  try {
    const response = await fetch('/update-email', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({
        dragged_first_name,
        dragged_last_name,
        target_department,
        target_first_name,
        target_last_name
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