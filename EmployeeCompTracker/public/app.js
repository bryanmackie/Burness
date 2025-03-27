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
    const allLeaves = node.children.every(child => !child.children);
    if (allLeaves) {
      node.children.forEach((child, i) => {
        child.x = node.x + 30;
        child.y = node.y + vSpacing * (i + 1);
        assignPositions(child, hSpacing, vSpacing);
      });
    } else {
      node.children.forEach((child, i) => {
        child.x = node.x + hSpacing * i;
        child.y = node.y + vSpacing;
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

    // Clear container and prepare two SVG groups.
    const container = d3.select("#secondHierarchyContainer");
    container.html('');
    
    const containerWidth = container.node().getBoundingClientRect().width;
    const containerHeight = container.node().getBoundingClientRect().height;
    
    // Global SVG (left side)
    const globalSVG = container.append("svg")
      .attr("id", "globalSVG")
      .attr("width", containerWidth / 3)
      .attr("height", containerHeight)
      .style("position", "absolute")
      .style("left", "0px");
    
    // Domestic SVG (right side)
    const domesticSVG = container.append("svg")
      .attr("id", "domesticSVG")
      .attr("width", containerWidth * 2 / 3)
      .attr("height", containerHeight)
      .style("position", "absolute")
      .style("left", containerWidth / 3 + "px");
      
    // Create an overlay container that spans the whole container.
    // Dragged elements will be temporarily moved here so they render on top.
    const overlay = container.append("div")
      .attr("id", "dragOverlay")
      .style("position", "absolute")
      .style("top", "0px")
      .style("left", "0px")
      .style("width", containerWidth + "px")
      .style("height", containerHeight + "px")
      .style("pointer-events", "none");  // so it doesn't block drop detection

    console.log("Rendering Global tree...");
    renderTree(globalSVG, data.global);
    console.log("Rendering Domestic tree...");
    renderTree(domesticSVG, data.domestic);
    
  } catch (error) {
    console.error("Error initializing second interactive tree:", error);
  }
}

function renderTree(svg, rootData) {
  const root = d3.hierarchy(rootData, d => d.children);
  const svgWidth = parseInt(svg.attr("width"), 10);
  const svgHeight = parseInt(svg.attr("height"), 10);
  
  // Center the root.
  root.x = svgWidth / 2;
  root.y = 20;
  
  const horizontalSpacing = 120;
  const verticalSpacing = 60;
  assignPositions(root, horizontalSpacing, verticalSpacing);

  // Render links.
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

  // Draw rectangles for each node (width increased to 130px, centered with x offset -65).
  node.append('rect')
    .attr('width', 130)
    .attr('height', 30)
    .attr('x', -65)
    .attr('y', -15)
    .attr('rx', 5)
    .attr('ry', 5)
    .style('fill', d => d.depth === 0 ? '#f0f0f0' : '#fff')
    .style('stroke', 'steelblue')
    .style('stroke-width', 2);

  // Add text labels.
  node.append('text')
    .attr('text-anchor', 'middle')
    .attr('dy', '0.35em')
    .style('font-size', '12px')
    .text(d => {
      if (d.depth === 0) {
        return d.data.label;
      } else {
        return `${d.data.first_name} ${d.data.last_name}`;
      }
    });

  // --- Drag Handlers ---
  function dragStarted(event, d) {
    d3.select(this).raise().classed("active", true);
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
    // Save reference to original parent so we can reattach if needed.
    d.originalParent = this.parentNode;
    // Move the dragged node to the overlay so it appears above both SVGs.
    const overlay = d3.select("#dragOverlay").node();
    overlay.appendChild(this);
    // Allow pointer events on the dragged element itself.
    d3.select(this).style("pointer-events", "all");
  }

  function dragged(event, d) {
    const dx = event.x - d.startX;
    const dy = event.y - d.startY;
    d3.select(this).attr("transform", translate(d.transformX + dx, d.transformY + dy));
  }

  async function dragEnded(event, d) {
    d3.select(this).select('rect').attr('stroke', 'steelblue');
    // Calculate drop position relative to the top-level container.
    const container = d3.select("#secondHierarchyContainer").node();
    const containerRect = container.getBoundingClientRect();
    const dropX = event.sourceEvent.clientX - containerRect.x;
    const dropY = event.sourceEvent.clientY - containerRect.y;
    console.log("Drop Position:", { x: dropX, y: dropY });
    let targetNode = null;

    // Look for drop targets from the nodes in both SVGs.
    d3.selectAll('.node').each(function(nodeData) {
      // Skip the dragged node.
      if (nodeData === d) return;
      const rect = this.getBoundingClientRect();
      // Convert the node's position to container coordinates.
      if (
        dropX >= rect.x - containerRect.x &&
        dropX <= rect.x - containerRect.x + rect.width &&
        dropY >= rect.y - containerRect.y &&
        dropY <= rect.y - containerRect.y + rect.height
      ) {
        targetNode = nodeData;
        console.log("Found target node:", targetNode.data);
      }
    });

    if (targetNode) {
      // Confirm and update based on the drop target.
      if (targetNode.data.label === "Domestic" || targetNode.data.label === "Global") {
        const confirmChange = confirm(`Update division to ${targetNode.data.label}?`);
        if (!confirmChange) {
          // Reattach to original parent if cancelled.
          d.originalParent.appendChild(this);
          return;
        }
        console.log(`Updating division to ${targetNode.data.label} for ${d.data.first_name}`);
        await updateEmailAidInDatabase(
          d.data.first_name,
          d.data.last_name,
          targetNode.data.label.toLowerCase(),
          null,
          null
        );
        // Reinitialize the tree which redraws all elements.
        initSecondInteractiveTree();
      } else {
        const confirmChange = confirm(`Update division to ${targetNode.data.division} and direct supervisor to ${targetNode.data.first_name} ${targetNode.data.last_name}?`);
        if (!confirmChange) {
          d.originalParent.appendChild(this);
          return;
        }
        console.log(`Updating division to ${targetNode.data.division} for ${d.data.first_name}`);
        await updateEmailAidInDatabase(
          d.data.first_name,
          d.data.last_name,
          targetNode.data.division,
          targetNode.data.first_name,
          targetNode.data.last_name
        );
        initInteractiveTree();
      }
      // In either case, the tree is re-rendered so the dragged element is removed.
    } else {
      console.warn("No valid drop target found. Update cancelled.");
      // If no valid drop, put the node back in its original group.
      d.originalParent.appendChild(this);
    }
  }
}

function translate(x, y) {
  return `translate(${x},${y})`;
}

/**
 * Posts the updated node information to the server.
 */
export async function updateEmailAidInDatabase(dragged_first_name, dragged_last_name, target_division, target_first_name, target_last_name) {
  try {
    const response = await fetch('/update-email', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({
        dragged_first_name,
        dragged_last_name,
        target_division,
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
