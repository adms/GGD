import unittest

import numpy as np

from create_cartoon_proxies import make_body


class CartoonSurfaceTest(unittest.TestCase):
    def test_lit_surfaces_face_outward_and_have_valid_rig_weights(self):
        for style in ['pink-round', 'yellow-teacher']:
            with self.subTest(style=style):
                body = make_body(style)
                positions, normals = np.array(body.positions), np.array(body.normals)
                indices = np.array(body.indices).reshape(-1, 3)
                triangles = positions[indices]
                geometric = np.cross(triangles[:, 1] - triangles[:, 0], triangles[:, 2] - triangles[:, 0])
                outward = np.sum(geometric * normals[indices].mean(axis=1), axis=1)
                self.assertTrue(np.all(outward > 1e-10), 'Inside-out surfaces invert PBR lighting even when double sided')
                np.testing.assert_allclose(np.linalg.norm(normals, axis=1), 1, atol=1e-6)
                self.assertTrue(np.all(np.asarray(body.joints) < len(body.nodes)))


if __name__ == '__main__':
    unittest.main()
