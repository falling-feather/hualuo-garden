from pathlib import Path
import bpy

def build_materials(texture_root: Path):
    definitions = {
        "plaster": ("plaster", (0.98,0.95,0.85), .92, 0),
        "plaster_warm": ("plaster", (0.89,0.81,0.63), .93, 0),
        "earthwall": ("plaster", (0.61,0.43,0.25), .98, 0),
        "stone": ("stone", (0.77,0.79,0.73), .88, 0),
        "white_stone": ("stone", (0.95,0.94,0.85), .82, 0),
        "dark_stone": ("stone", (0.46,0.52,0.48), .91, 0),
        "rock_stone": ("stone", (0.65,0.66,0.59), .94, 0),
        "scholar_stone": ("stone", (0.73,0.74,0.67), .93, 0),
        "brick": ("brick", (0.66,0.71,0.67), .9, 0),
        "paving": ("stone", (0.70,0.72,0.66), .9, 0),
        "paving_light": ("stone", (0.75,0.75,0.69), .92, 0),
        "deck_wood": ("wood", (0.48,0.37,0.23), .82, 0),
        "wood": ("wood", (0.37,0.21,0.115), .61, 0),
        "wood_light": ("wood", (0.61,0.40,0.21), .72, 0),
        "wood_dark": ("wood", (0.21,0.115,0.065), .68, 0),
        "redwood": ("wood", (0.44,0.13,0.09), .52, 0),
        "greenwood": ("wood", (0.15,0.30,0.245), .63, 0),
        "bronze": (None,(0.52,0.38,0.14), .4, .75),
        "tile": ("tile", (0.32,0.40,0.415), .75, 0),
        "tile_light": ("tile", (0.41,0.49,0.48), .78, 0),
        "tile_dark": ("tile", (0.23,0.29,0.3), .8, 0),
        "thatch": ("thatch", (0.50,0.42,0.29), .97, 0),
        "paper": ("paper", (0.99,0.91,0.71), .9, 0),
        "rose_silk": ("cloth", (0.85,0.53,0.53), .87, 0),
        "jade_silk": ("cloth", (0.5,0.68,0.55), .87, 0),
        "vermilion_silk": ("cloth", (0.57,0.14,0.115), .86, 0),
        "bark": ("bark", (1,1,1), .99, 0),
        "bamboo": ("wood", (0.44,0.47,0.29), .82, 0),
        "bamboo_ring": ("wood", (0.54,0.52,0.34), .85, 0),
        "leaf": ("leaf", (0.28,0.40,0.12), .82, 0),
        "leaf_light": ("leaf",(0.38,0.49,0.18),.8,0),
        "leaf_dark": ("leaf",(0.22,0.32,0.09),.92,0),
        "fallen_leaf": ("leaf",(.40,.31,.13),.95,0),
        "grass_blade": (None,(.33,.43,.18),.96,0),
        "flower_pink": (None,(0.92,0.56,0.62),.85,0),
        "flower_white": (None,(0.99,0.93,0.79),.86,0),
        "flower_red": (None,(0.75,0.10,0.16),.8,0),
        "flower_gold": (None,(0.92,0.67,0.20),.84,0),
        "reed": (None,(0.58,0.55,0.29),.92,0),
        "grass": ("earth",(0.48,0.59,0.32),.98,0),
        "terrain": ("lawn",(1.0,1.0,1.0),.98,0),
        "soil": ("earth",(0.55,0.40,0.23),.98,0),
        "moss": ("earth",(0.27,0.36,0.16),.98,0),
        "water": (None,(0.12,0.29,0.245),.23,0),
        "ceramic": (None,(0.66,0.76,0.68),.24,.05),
        "porcelain": (None,(0.90,0.90,0.78),.27,.02),
        "ink": (None,(0.04,0.055,0.045),.92,0),
        "gold_letter": (None,(0.85,0.68,0.31),.38,.55),
        "lantern": (None,(1.0,.62,.19),.55,0),
        "mirror": (None,(.65,.76,.74),.12,.9),
    }
    out={}
    for name,(texture,color,roughness,metalness) in definitions.items():
        color=tuple(v/12.92 if v<=.04045 else ((v+.055)/1.055)**2.4 for v in color)
        mat=bpy.data.materials.new(name)
        mat.use_nodes=True
        mat.diffuse_color=(*color,1)
        mat["gardenMaterial"]=name
        mat["baseRoughness"]=roughness
        bsdf=mat.node_tree.nodes.get("Principled BSDF")
        bsdf.inputs["Base Color"].default_value=(*color,1)
        bsdf.inputs["Roughness"].default_value=roughness
        bsdf.inputs["Metallic"].default_value=metalness
        if name=="lantern":
            bsdf.inputs["Emission Color"].default_value=(1,.46,.1,1)
            bsdf.inputs["Emission Strength"].default_value=.45
        if name=="water":
            bsdf.inputs["IOR"].default_value=1.333
            bsdf.inputs["Transmission Weight"].default_value=.06
            noise=mat.node_tree.nodes.new("ShaderNodeTexNoise")
            noise.inputs["Scale"].default_value=7
            noise.inputs["Detail"].default_value=3
            bump=mat.node_tree.nodes.new("ShaderNodeBump")
            bump.inputs["Strength"].default_value=.32
            bump.inputs["Distance"].default_value=.065
            mat.node_tree.links.new(noise.outputs["Fac"],bump.inputs["Height"])
            mat.node_tree.links.new(bump.outputs["Normal"],bsdf.inputs["Normal"])
        if name.startswith("flower") or name.startswith("leaf"):
            bsdf.inputs["Subsurface Weight"].default_value=.09
        if name.endswith('_silk'):
            bsdf.inputs['Sheen Weight'].default_value=.22
            bsdf.inputs['Sheen Roughness'].default_value=.7
        if texture:
            nodes,links=mat.node_tree.nodes,mat.node_tree.links
            img=nodes.new("ShaderNodeTexImage")
            img.image=bpy.data.images.load(str(texture_root/f"{texture}-color.jpg"),check_existing=True)
            multiply=nodes.new("ShaderNodeMix")
            multiply.data_type="RGBA"
            multiply.blend_type="MULTIPLY"
            multiply.inputs[0].default_value=1
            multiply.inputs[7].default_value=(*color,1)
            links.new(img.outputs["Color"],multiply.inputs[6])
            if name=="terrain":
                vertex_color=nodes.new("ShaderNodeVertexColor")
                vertex_color.layer_name="GardenColor"
                links.new(vertex_color.outputs["Color"],multiply.inputs[7])
            links.new(multiply.outputs[2],bsdf.inputs["Base Color"])
            normal_image=nodes.new("ShaderNodeTexImage")
            normal_image.image=bpy.data.images.load(str(texture_root/f"{texture}-normal.png"),check_existing=True)
            normal_image.image.colorspace_settings.name="Non-Color"
            normal=nodes.new("ShaderNodeNormalMap")
            normal.inputs["Strength"].default_value=.35 if name in ["wood","wood_light","redwood"] else .6
            links.new(normal_image.outputs["Color"],normal.inputs["Color"])
            links.new(normal.outputs["Normal"],bsdf.inputs["Normal"])
            if (texture_root/f'{texture}-roughness.jpg').exists():
                rough=nodes.new('ShaderNodeTexImage')
                rough.image=bpy.data.images.load(str(texture_root/f'{texture}-roughness.jpg'),check_existing=True)
                rough.image.colorspace_settings.name='Non-Color'
                multiply_rough=nodes.new('ShaderNodeMath');multiply_rough.operation='MULTIPLY'
                multiply_rough.inputs[1].default_value=min(1,roughness/.8)
                links.new(rough.outputs['Color'],multiply_rough.inputs[0])
                links.new(multiply_rough.outputs[0],bsdf.inputs['Roughness'])
        out[name]=mat
    return out
