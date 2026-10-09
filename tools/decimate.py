"""Blender 无头减面：Tripo 高精度模型（~200 万面）→ 游戏预算
用法：Blender -b -P tools/decimate.py -- in.glb out.glb 目标三角面数
之后再跑 tools/glb-shrink.py 把贴图压到 1024 JPEG"""
import sys, bpy

argv = sys.argv[sys.argv.index('--') + 1:]
src, dst, target = argv[0], argv[1], int(argv[2])

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=src)
meshes = [o for o in bpy.context.scene.objects if o.type == 'MESH']
tris = sum(sum(len(p.vertices) - 2 for p in o.data.polygons) for o in meshes)
for o in meshes:
    bpy.context.view_layer.objects.active = o
    o.select_set(True)
    # 先合并重复顶点：Tripo 导出的网格在 UV 接缝处是断开的，不焊上 collapse 会被边界锁死
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.mesh.remove_doubles(threshold=1e-5)
    bpy.ops.object.mode_set(mode='OBJECT')
    cur0 = sum(len(p.vertices) - 2 for p in o.data.polygons)
    want = max(target * cur0 / max(tris, 1), 50)  # 多个子网格按面数比例分预算
    for _ in range(3):  # 一次 collapse 压不到位，分几轮逼近目标
        cur = sum(len(p.vertices) - 2 for p in o.data.polygons)
        if cur <= want * 1.15: break
        m = o.modifiers.new('dec', 'DECIMATE')
        m.decimate_type = 'COLLAPSE'
        m.ratio = want / cur
        m.use_collapse_triangulate = True
        bpy.ops.object.modifier_apply(modifier=m.name)
after = sum(sum(len(p.vertices) - 2 for p in o.data.polygons) for o in meshes)
bpy.ops.export_scene.gltf(filepath=dst, export_format='GLB', export_yup=True,
                          export_image_format='JPEG', export_jpeg_quality=88)
print(f'DECIMATE {src}: {tris} → {after} tris')
