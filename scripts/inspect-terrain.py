"""Compact terrain / wall-foundation inspection without building or rendering assets.

Run:
  blender --background --factory-startup --python-exit-code 1 --python scripts/inspect-terrain.py

The first run captures public/garden.manifest.json as a statistical baseline.
Later runs preserve that baseline in the report; -- --reset-baseline deliberately
starts a new comparison.  No full height field or mesh data is written.
"""
import argparse
import ast
import hashlib
import json
import math
import sys
import time
from collections import Counter
from datetime import datetime,timezone
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/"art"/"blender"))
from geometry import MeshBuilder
import architecture
from landscape import Ground
from route_geometry import transform_port
from terrain import wall_sections

SOURCE_PATHS=["scripts/inspect-terrain.py","art/garden-plan.json","art/blender/terrain.py",
              "art/blender/landscape.py","art/blender/architecture.py","art/blender/geometry.py",
              "art/blender/route_geometry.py"]


def timestamp():return datetime.now(timezone.utc).isoformat()


def hashes():
    return {name:hashlib.sha256((ROOT/name).read_bytes()).hexdigest() for name in SOURCE_PATHS}


def height_summary(heights,water_level):
    dry=sorted(h for h in heights if h>water_level+.12)
    if not dry or not all(math.isfinite(h) for h in heights):
        raise ValueError("Terrain must contain finite heights and dry samples")
    return {"heightRange":[min(heights),max(heights)],"drySamples":len(dry),
            "dryFractionAtMost1m":round(sum(h<=1 for h in dry)/len(dry),6),
            "dryFractionOver3m":round(sum(h>3 for h in dry)/len(dry),6),
            "dryQuantiles":{str(q):round(dry[int((len(dry)-1)*q)],4) for q in [.1,.5,.75,.9,.95]}}


def baseline(output,reset):
    if output.is_file() and not reset:
        previous=json.loads(output.read_text(encoding="utf-8"))
        if "baseline" in previous:return previous["baseline"]
    path=ROOT/"public/garden.manifest.json";raw=path.read_bytes();manifest=json.loads(raw)
    terrain=manifest["terrain"]
    return {"source":"public/garden.manifest.json","sha256":hashlib.sha256(raw).hexdigest(),
            "capturedAt":timestamp(),"size":terrain["size"],"bounds":terrain["bounds"],
            **height_summary(terrain["heights"],manifest["water"]["level"])}


class PadBuilder(MeshBuilder):
    """Run the real placement logic, retaining only pads and attachment ports."""
    def ignore(self,*args,**kwargs):pass
    add=box=beam=cylinder=lathe=sphere=tube=quad=disk=plaque=collider=walk_surface=walk_quad=ignore


def construction_constraints(plan):
    # These surface-only helpers have no terrain-pad or port side effects.
    # Skipping them avoids expensive roof tessellation, tree leaves and rock
    # meshing while the authoritative landmark/entry constructors still run.
    names=["tree","bamboo","banana","rock","scholar_rock","rock_arch","reeds","leaf",
           "flower","chrysanthemum","roof","pavilion_roof","roof_join"]
    saved={name:getattr(architecture,name) for name in names}
    pads=[];ports={};owners=Counter()
    try:
        for name in names:setattr(architecture,name,lambda *args,**kwargs:None)
        for site in plan["landmarks"]:
            builder=PadBuilder(site["id"])
            architecture.landmark(builder,site)
            ports.update({site["id"]+":"+name:transform_port(port,site) for name,port in builder.ports.items()})
            for pad in builder.terrain_pads:
                point=transform_port({"position":pad["position"],"direction":[1,0]},site)["position"]
                pads.append({**pad,"position":point,"rotation":pad["rotation"]+site["rotation"]})
                owners[site["id"]]+=1
    finally:
        for name,value in saved.items():setattr(architecture,name,value)
    if not pads:raise ValueError("No construction pads were captured")
    return pads,ports,dict(sorted(owners.items()))


def boundary_polyline():
    # Keep the boundary's coordinates authoritative in build_landscape; reading
    # its literal avoids maintaining a second, silently diverging wall layout.
    source=ast.parse((ROOT/"art/blender/landscape.py").read_text(encoding="utf-8-sig"))
    function=next(node for node in source.body if isinstance(node,ast.FunctionDef) and node.name=="build_landscape")
    assignment=next(node for node in function.body if isinstance(node,ast.Assign)
                    and any(isinstance(target,ast.Name) and target.id=="wall" for target in node.targets))
    return ast.literal_eval(assignment.value)


def inspect_foundations(ground):
    wall=boundary_polyline();runs=0;samples=0;maximum_gap=-math.inf;worst=None
    for edge,(a,b) in enumerate(zip(wall,wall[1:])):
        if edge==1:continue  # The entry opening used by build_landscape.
        for section in wall_sections(a,b,ground.height):
            runs+=1
            for before,after in zip(section["lower"],section["lower"][1:]):
                for face in [0,1]:
                    for t in [0,.25,.5,.75,1]:
                        p=[before[face][i]+(after[face][i]-before[face][i])*t for i in range(3)]
                        terrain=ground.height(*p[:2]);gap=p[2]-terrain;samples+=1
                        if gap>maximum_gap:
                            maximum_gap=gap
                            worst={"position":[round(p[0],3),round(p[1],3)],"side":"front" if face==0 else "back",
                                   "foundationBottom":round(p[2],4),"groundHeight":round(terrain,4)}
    return {"sections":runs,"samples":samples,"maximumGap":round(maximum_gap,6),
            "minimumEmbed":round(-maximum_gap,6),"worstSample":worst,"passed":maximum_gap<=-.12}


def key_samples(plan,ground,ports):
    sites={s["id"]:s for s in plan["landmarks"]}
    nodes={n["id"]:n for n in plan["circulation"]["nodes"]}
    probes=[("arrival",nodes["arrival"]["position"]),("gate:entry",ports["gate:entry"]["position"]),
            ("gate-center",sites["gate"]["position"]),("gate:rear",ports["gate:rear"]["position"]),
            ("gate-inner",nodes["gate-inner"]["position"]),("screen:entry",ports["screen:entry"]["position"]),
            ("screen:rear",ports["screen:rear"]["position"])]
    probes.extend((name,sites[name]["position"]) for name in ["cubi","longcui","aojing"])
    probes.extend([("western-ridge",[-73,10]),("northern-ridge",[-37,82]),("eastern-ridge",[72,44])])
    return [{"id":name,"position":[round(p[0],3),round(p[1],3)],"groundHeight":round(ground.height(*p[:2]),4),
             **({"deckHeight":round(ports[name]["position"][2],4)} if name in ports else {})} for name,p in probes]


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--reset-baseline",action="store_true")
    args=parser.parse_args(sys.argv[sys.argv.index("--")+1:] if "--" in sys.argv else [])
    output=ROOT/"output/qa/terrain-profile.json"
    old=baseline(output,args.reset_baseline);before=hashes();started=time.perf_counter()
    plan=json.loads((ROOT/"art/garden-plan.json").read_text(encoding="utf-8"))
    pads,ports,owners=construction_constraints(plan)
    ground=Ground(plan,pads);ground.bake()
    foundation=inspect_foundations(ground)
    conflicts=[name for name,port in ports.items() if ground.height(*port["position"][:2])>port["position"][2]+.04]
    current={"size":ground.grid_size,"bounds":plan["bounds"],**height_summary(ground.grid,plan["water"]["level"]),
             "extraPadCount":len(pads),"padSources":owners,"portCount":len(ports),"terrainAtEntries":conflicts}
    after=hashes();changed=before!=after;passed=foundation["passed"] and not conflicts and not changed
    report={"schemaVersion":1,"generatedAt":timestamp(),"passed":passed,"baseline":old,"current":current,
            "boundaryFoundations":foundation,"keySamples":key_samples(plan,ground,ports),
            "sourceHashes":before,"sourceChangedDuringInspection":changed,
            "inspectionSeconds":round(time.perf_counter()-started,3),
            "scope":"Shared terrain with actual construction pads; boundary front/back foundations and entry samples. No rendering or full route traversal."}
    output.write_text(json.dumps(report,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    print("TERRAIN_PROFILE "+json.dumps({"passed":passed,"output":"output/qa/terrain-profile.json",
          "extraPads":len(pads),"wallSections":foundation["sections"],"minimumEmbed":foundation["minimumEmbed"],
          "terrainAtEntries":conflicts,"sourceChanged":changed,"seconds":report["inspectionSeconds"]}),flush=True)
    if not passed:raise RuntimeError("Terrain profile inspection failed")


if __name__=="__main__":main()
