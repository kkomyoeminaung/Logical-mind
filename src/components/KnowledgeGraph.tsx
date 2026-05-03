import React, { useEffect, useRef } from 'react';
import * as d3 from 'd3';

interface Node extends d3.SimulationNodeDatum {
    id: string;
    type: string;
}

interface Link extends d3.SimulationLinkDatum<Node> {
    verb: string;
}

interface KnowledgeGraphProps {
    data: any[];
}

export const KnowledgeGraph: React.FC<KnowledgeGraphProps> = ({ data }) => {
    const svgRef = useRef<SVGSVGElement>(null);

    useEffect(() => {
        if (!svgRef.current || !data.length) return;

        const width = 800;
        const height = 500;

        const nodes: Node[] = [];
        const links: Link[] = [];

        data.forEach(n => {
            if (!nodes.find(node => node.id === n.id)) {
                nodes.push({ id: n.id, type: n.type });
            }
            n.relations.forEach((rel: any) => {
                if (!nodes.find(node => node.id === rel.targetId)) {
                    nodes.push({ id: rel.targetId, type: 'ENTITY' });
                }
                links.push({ source: n.id, target: rel.targetId, verb: rel.verb });
            });
        });

        const svg = d3.select(svgRef.current);
        svg.selectAll('*').remove();

        const simulation = d3.forceSimulation<Node>(nodes)
            .force('link', d3.forceLink<Node, Link>(links).id(d => d.id).distance(120))
            .force('charge', d3.forceManyBody().strength(-300))
            .force('center', d3.forceCenter(width / 2, height / 2))
            .force('collision', d3.forceCollide().radius(50));

        const g = svg.append('g');

        const link = g.append('g')
            .selectAll('line')
            .data(links)
            .enter().append('line')
            .attr('stroke', '#1a1a1e')
            .attr('stroke-opacity', 0.1)
            .attr('stroke-width', 1);

        const edgeLabels = g.append('g')
            .selectAll('text')
            .data(links)
            .enter().append('text')
            .style('font-size', '8px')
            .style('fill', '#1a1a1e')
            .style('opacity', 0.4)
            .attr('text-anchor', 'middle')
            .text(d => d.verb.replace(/_/g, ' '));

        const node = g.append('g')
            .selectAll('g')
            .data(nodes)
            .enter().append('g')
            .call(d3.drag<SVGGElement, Node>()
                .on('start', dragstarted)
                .on('drag', dragged)
                .on('end', dragended) as any);

        node.append('circle')
            .attr('r', 6)
            .attr('fill', d => d.type === 'STATE' ? '#3b82f6' : '#1a1a1e')
            .attr('stroke', '#fff')
            .attr('stroke-width', 2);

        node.append('text')
            .attr('dx', 10)
            .attr('dy', 4)
            .style('font-size', '10px')
            .style('font-weight', 'bold')
            .style('fill', '#1a1a1e')
            .text(d => d.id);

        simulation.on('tick', () => {
            link
                .attr('x1', (d: any) => d.source.x)
                .attr('y1', (d: any) => d.source.y)
                .attr('x2', (d: any) => d.target.x)
                .attr('y2', (d: any) => d.target.y);

            edgeLabels
                .attr('x', (d: any) => (d.source.x + d.target.x) / 2)
                .attr('y', (d: any) => (d.source.y + d.target.y) / 2);

            node
                .attr('transform', (d: any) => `translate(${d.x},${d.y})`);
        });

        function dragstarted(event: any, d: any) {
            if (!event.active) simulation.alphaTarget(0.3).restart();
            d.fx = d.x;
            d.fy = d.y;
        }

        function dragged(event: any, d: any) {
            d.fx = event.x;
            d.fy = event.y;
        }

        function dragended(event: any, d: any) {
            if (!event.active) simulation.alphaTarget(0);
            d.fx = null;
            d.fy = null;
        }

        // Zoom & Pan
        svg.call(d3.zoom<SVGSVGElement, unknown>()
            .extent([[0, 0], [width, height]])
            .scaleExtent([0.5, 5])
            .on('zoom', (event) => {
                g.attr('transform', event.transform);
            }));

    }, [data]);

    return (
        <div className="bg-white border border-black/[0.05] rounded-3xl overflow-hidden shadow-inner">
            <svg 
                ref={svgRef} 
                width="100%" 
                height="500" 
                viewBox="0 0 800 500" 
                style={{ cursor: 'grab' }}
            />
            <div className="p-4 border-t border-black/[0.03] flex justify-between items-center bg-black/[0.01]">
                <div className="text-[10px] font-bold uppercase tracking-widest opacity-30 flex items-center gap-4">
                    <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-[#1a1a1e]"></span> Entity</span>
                    <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-[#3b82f6]"></span> State</span>
                </div>
                <div className="text-[8px] font-mono opacity-20 italic">Force-Directed Knowledge Topology (v1.0)</div>
            </div>
        </div>
    );
};
