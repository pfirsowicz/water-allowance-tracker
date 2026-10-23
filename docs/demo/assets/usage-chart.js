"use strict";

/* Offline, accessible SVG chart with no charting library or remote assets. */
const WaterUsageChart = (() => {
  const NS="http://www.w3.org/2000/svg";
  const maxBars=8;

  function svgNode(tag, attrs={}, value) {
    const node=document.createElementNS(NS,tag);
    for(const [key,val] of Object.entries(attrs)) node.setAttribute(key,String(val));
    if (value !== undefined) node.textContent=String(value);
    return node;
  }
  function displayDate(iso) {
    return new Intl.DateTimeFormat("en-NZ",{
      day:"numeric",month:"short",timeZone:"UTC"
    }).format(new Date(iso+"T00:00:00Z"));
  }
  function draw(container, history) {
    container.replaceChildren();
    const intervals=history.slice(-maxBars);
    if (intervals.length===0) {
      const message=document.createElement("p");
      message.className="usage-empty";
      message.textContent="Add readings on different dates to see average consumption.";
      container.appendChild(message);
      return;
    }
    const width=860,height=260,left=71,right=24,top=28,bottom=52;
    const plotHeight=height-top-bottom;
    const allowance=intervals[0].allowancePerDay;
    const topValue=Math.max(allowance,...intervals.map(x=>x.averagePerDay),1)*1.18;
    const y=value=>top+plotHeight-(value/topValue)*plotHeight;
    const svg=svgNode("svg",{
      viewBox:"0 0 "+width+" "+height,
      role:"img",
      class:"usage-svg",
      "aria-label":"Average litres per day for the last "+intervals.length+
        " meter-reading intervals, compared with the daily allowance"
    });
    svg.appendChild(svgNode("title",{},"Average consumption per measured interval"));
    for(const fraction of [0,0.5,1]) {
      const amount=topValue*fraction,position=y(amount);
      svg.appendChild(svgNode("line",{
        x1:left,x2:width-right,y1:position,y2:position,class:"usage-gridline"
      }));
      svg.appendChild(svgNode("text",{
        x:left-12,y:position+4,"text-anchor":"end",class:"usage-axis-label"
      },Math.round(amount).toLocaleString("en-NZ")));
    }
    const slot=(width-left-right)/intervals.length;
    const barWidth=Math.min(60,slot*0.58);
    for (const [index,item] of intervals.entries()) {
      const x=left+slot*(index+0.5);
      const bar=svgNode("rect",{
        x:x-barWidth/2,y:y(item.averagePerDay),
        width:barWidth,height:item.averagePerDay/topValue*plotHeight,
        rx:5,
        class:item.averagePerDay>allowance ? "usage-bar-over":"usage-bar-under",
        "data-interval-end":item.toDate,
        "data-average":item.averagePerDay
      });
      bar.appendChild(svgNode("title",{},
        displayDate(item.fromDate)+" to "+displayDate(item.toDate)+": "+
        item.litresUsed.toLocaleString("en-NZ")+" L in "+item.days+" days, "+
        Math.round(item.averagePerDay).toLocaleString("en-NZ")+" L/day average"
      ));
      svg.appendChild(bar);
      svg.appendChild(svgNode("text",{
        x,y:height-bottom+21,"text-anchor":"middle",class:"usage-x-label"
      },displayDate(item.toDate)));
    }
    const allowanceY=y(allowance);
    svg.appendChild(svgNode("line",{
      x1:left,x2:width-right,y1:allowanceY,y2:allowanceY,
      "stroke-dasharray":"6 5",class:"usage-allowance-line"
    }));
    svg.appendChild(svgNode("text",{
      x:width-right,y:Math.max(15,allowanceY-7),
      "text-anchor":"end",class:"usage-allowance-label"
    },"Allowance "+allowance.toLocaleString("en-NZ")+" L/day"));
    svg.appendChild(svgNode("text",{x:17,y:14,class:"usage-axis-heading"},"L/day"));
    container.appendChild(svg);

    const details=document.createElement("ul");
    details.className="visually-hidden";
    details.setAttribute("aria-label","Meter-reading interval values");
    for(const item of intervals) {
      const li=document.createElement("li");
      li.textContent=item.fromDate+" to "+item.toDate+", "+item.days+
        " days, "+item.litresUsed+" litres used, "+
        item.averagePerDay.toFixed(1)+" litres per day average, "+
        item.allowancePerDay+" litres per day allowance";
      details.appendChild(li);
    }
    container.appendChild(details);
  }
  return {draw};
})();
