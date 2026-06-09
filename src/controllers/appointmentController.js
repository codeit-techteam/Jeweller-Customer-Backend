import {
  adminUpdateAppointmentStatus,
  getAppointmentForUser,
  listAppointmentsForAdmin,
  listAppointmentsForUser,
  softDeleteAppointmentForUser,
  updateAppointmentStatus,
} from '../services/appointmentService.js';
import { supabase } from '../config/supabase.js';
import { dispatchSystemEvent, dispatchToUser } from '../services/notificationEngine.js';

export async function createAppointment(req, res, next) {
  try {
    const {
      userId,
      boutiqueId,
      date,
      time,
      type = 'in-store',
      notes,
      customerName,
      customerPhone,
      serviceRequested,
    } = req.body ?? {};

    if (!boutiqueId || !date || !time) {
      return res.status(400).json({
        success: false,
        message: 'boutiqueId, date, and time are required',
      });
    }

    const { data: boutique, error: boutiqueError } = await supabase
      .from('boutiques')
      .select('id, name, jeweller_user_id')
      .eq('id', boutiqueId)
      .single();

    if (boutiqueError || !boutique) {
      return res.status(404).json({ success: false, message: 'Boutique not found' });
    }

    const starts_at = new Date(`${date}T${time}:00Z`).toISOString();

    const { data: appointment, error: insertError } = await supabase
      .from('appointments')
      .insert({
        user_id: userId ?? null,
        boutique_id: boutiqueId,
        date,
        time,
        type,
        notes: notes ?? null,
        customer_name: customerName ?? null,
        customer_phone: customerPhone ?? null,
        service_requested: serviceRequested ?? null,
        status: 'upcoming',
        starts_at,
      })
      .select()
      .single();

    if (insertError) {
      return next(insertError);
    }

    if (userId) {
      await dispatchSystemEvent('appointment_booked', {
        userId,
        appointmentId: appointment.id,
        boutiqueName: boutique.name ?? null,
      });
    }
    if (boutique.jeweller_user_id) {
      await dispatchToUser({
        userId: boutique.jeweller_user_id,
        title: 'New appointment request',
        message: `${customerName ?? 'A customer'} booked for ${date} at ${time}.`,
        type: 'appointment',
        actionType: 'appointment',
        actionId: appointment.id,
        metadata: {
          eventKey: `appointment_booked:${appointment.id}:boutique`,
          sourceEvent: 'appointment_received',
          route: '/(app)/appointments',
        },
      });
    }

    return res.status(201).json({
      success: true,
      data: appointment,
      message: 'Appointment booked successfully',
    });
  } catch (error) {
    return next(error);
  }
}

export async function listAppointmentsAdmin(req, res, next) {
  try {
    const status =
      typeof req.query.status === 'string' && req.query.status.trim()
        ? req.query.status.trim()
        : 'all';
    const boutiqueId =
      typeof req.query.boutiqueId === 'string' && req.query.boutiqueId.trim()
        ? req.query.boutiqueId.trim()
        : null;

    const data = await listAppointmentsForAdmin({ status, boutiqueId });
    return res.status(200).json({
      success: true,
      data,
      message: 'Appointments fetched successfully',
    });
  } catch (error) {
    return next(error);
  }
}

export async function patchAppointmentAdmin(req, res, next) {
  try {
    const { appointmentId } = req.params;
    const status = req.body?.status;
    if (typeof status !== 'string') {
      return res.status(400).json({ success: false, message: 'status required' });
    }
    const row = await adminUpdateAppointmentStatus(appointmentId, status);
    return res.status(200).json({
      success: true,
      data: row,
      message: 'Appointment updated successfully',
    });
  } catch (error) {
    if (error.statusCode === 404) {
      return res.status(404).json({ success: false, data: null, message: 'Not found' });
    }
    if (error.statusCode === 400) {
      return res.status(400).json({ success: false, data: null, message: error.message });
    }
    return next(error);
  }
}

export async function listAppointments(req, res, next) {
  try {
    const fromQuery =
      typeof req.query.userId === 'string' && req.query.userId.trim() ? req.query.userId.trim() : null;
    const userId = fromQuery;
    if (!userId) {
      return res.status(400).json({
        success: false,
        message: 'Missing userId. Use GET /api/appointments?userId=<uuid>',
      });
    }
    const data = await listAppointmentsForUser(userId);
    return res.status(200).json({ success: true, data });
  } catch (error) {
    return next(error);
  }
}

export async function getAppointment(req, res, next) {
  try {
    const { appointmentId } = req.params;
    const userId = req.query.userId ?? req.headers['x-user-id'];
    if (!userId || typeof userId !== 'string') {
      return res.status(400).json({ success: false, message: 'userId required' });
    }
    const row = await getAppointmentForUser(appointmentId, String(userId).trim());
    if (!row) {
      return res.status(404).json({ success: false, message: 'Not found' });
    }
    return res.status(200).json({ success: true, data: row });
  } catch (error) {
    return next(error);
  }
}

export async function patchAppointment(req, res, next) {
  try {
    const { appointmentId } = req.params;
    const userId = req.headers['x-user-id'];
    if (!userId || typeof userId !== 'string') {
      return res.status(400).json({ success: false, message: 'x-user-id required' });
    }
    const status = req.body?.status;
    if (typeof status !== 'string') {
      return res.status(400).json({ success: false, message: 'status required' });
    }
    const row = await updateAppointmentStatus(appointmentId, userId.trim(), status);
    return res.status(200).json({ success: true, data: row });
  } catch (error) {
    return next(error);
  }
}

export async function deleteAppointment(req, res, next) {
  try {
    const { appointmentId } = req.params;
    const userId = req.headers['x-user-id'];
    if (!userId || typeof userId !== 'string') {
      return res.status(400).json({ success: false, message: 'x-user-id required' });
    }
    const result = await softDeleteAppointmentForUser(appointmentId, userId.trim());
    return res.status(200).json({ success: true, data: result });
  } catch (error) {
    return next(error);
  }
}
