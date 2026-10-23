"""Render the saved master from connection-level inspection cameras without saving edits."""
import bpy,math,json
from pathlib import Path
from mathutils import Vector
root=Path(__file__).resolve().parents[1];scene=bpy.context.scene
scene.render.engine='CYCLES';scene.cycles.samples=40;scene.cycles.use_denoising=True
prefs=bpy.context.preferences.addons['cycles'].preferences;prefs.compute_device_type='OPTIX';prefs.get_devices()
for device in prefs.devices:device.use=device.type=='OPTIX'
scene.cycles.device='GPU';scene.render.resolution_x=1600;scene.render.resolution_y=1050;scene.render.resolution_percentage=100
shots=[('ouxiang-connections',(43,-20,22),(23,8,1.2),43),('ouxiang-east-joint',(44,0,8),(36.5,10,1.3),46),('qinfang-connections',(7,-63,14),(-8,-47,1.1),46),('luxue-landing',(6,6,12),(-3,19,1.0),46),('cubi-stairs',(82,-3,23),(60,19,5.5),47)]
shots.insert(1,('ouxiang-structure',(32,-7,4.2),(25,5.5,1.6),44))
for name,position,target,lens in shots:
 scene.camera.location=position;scene.camera.rotation_euler=(Vector(target)-scene.camera.location).to_track_quat('-Z','Y').to_euler();scene.camera.data.lens=lens
 scene.render.filepath=str(root/'output/previews'/(name+'.png'))
 bpy.ops.render.render(write_still=True)
 print('CONNECTION_RENDER',name,flush=True)
