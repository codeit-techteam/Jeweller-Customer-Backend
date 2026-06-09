import { Router } from 'express';
import {
  createAppointment,
  deleteAppointment,
  getAppointment,
  listAppointments,
  listAppointmentsAdmin,
  patchAppointment,
  patchAppointmentAdmin,
} from '../controllers/appointmentController.js';

const router = Router();

router.get('/admin', listAppointmentsAdmin);
router.patch('/admin/:appointmentId', patchAppointmentAdmin);

router.post('/', createAppointment);

/** GET /api/appointments?userId=… (preferred; avoids proxy/param issues) */
router.get('/', listAppointments);
router.get('/detail/:appointmentId', getAppointment);
router.patch('/:appointmentId', patchAppointment);
router.delete('/:appointmentId', deleteAppointment);

export default router;
