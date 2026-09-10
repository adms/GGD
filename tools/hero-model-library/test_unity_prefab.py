"""Coordinate conversion must preserve skinned positions under nontrivial poses."""
import unittest
import numpy as np
from convert_unity_prefab import REFLECTION, converted_trs, skin_arrays, skin_positions, trs_matrix


class PrefabSkin(unittest.TestCase):
    def test_reflection_preserves_weighted_vertices_for_multiple_joint_poses(self):
        pos=np.array([[1.,2.,3.],[-2.,.5,4.]])
        joints=np.array([[0,1],[1,0]])
        weights=np.array([[.3,.7],[.8,.2]])
        bind=np.array([trs_matrix([1,2,3],[0,.4,0,.9],[1,1,1]), trs_matrix([-2,1,0],[.3,0,0,.9],[1,1,1])])
        for angle in [0.,.7,1.8]:
            world=np.array([trs_matrix([0,angle,0],[0,0,np.sin(angle/2),np.cos(angle/2)],[1,2,1]),
                            trs_matrix([angle,0,0],[np.sin(angle/2),0,0,np.cos(angle/2)],[1,1,1])])
            original=skin_positions(pos,joints,weights,world@bind)
            converted=skin_positions(pos*[-1,1,1],joints,weights,(REFLECTION@world@REFLECTION)@(REFLECTION@bind@REFLECTION))
            np.testing.assert_allclose(converted,original*[-1,1,1],atol=1e-12)

    def test_node_trs_reflection_and_invalid_transforms(self):
        tree={'m_LocalPosition':dict(x=1,y=2,z=3),'m_LocalRotation':dict(x=.2,y=.4,z=.1,w=.8),'m_LocalScale':dict(x=2,y=3,z=4)}
        source=trs_matrix([1,2,3],[.2,.4,.1,.8],[2,3,4])
        np.testing.assert_allclose(trs_matrix(*converted_trs(tree)),REFLECTION@source@REFLECTION)
        for quaternion in [[0,0,0,0],[float('nan'),0,0,1]]:
            with self.assertRaises(ValueError): trs_matrix([0,0,0],quaternion,[1,1,1])

    def test_rigid_and_two_weight_channels_preserve_joint_order(self):
        joints,weights,rigid=skin_arrays([[4],[7]],None,2)
        self.assertTrue(rigid)
        np.testing.assert_array_equal(joints,[[4,0,0,0],[7,0,0,0]])
        np.testing.assert_array_equal(weights,[[1,0,0,0],[1,0,0,0]])
        joints,weights,rigid=skin_arrays([[4,2]],[[.3,.7]],1)
        self.assertFalse(rigid)
        np.testing.assert_array_equal(joints,[[4,2,0,0]])
        np.testing.assert_allclose(weights,[[.3,.7,0,0]])
        with self.assertRaises(ValueError): skin_arrays([[1,2]],None,1)


if __name__=='__main__': unittest.main()
