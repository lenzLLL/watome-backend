import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();
export const getPlanSubscriptions = async (req, res) => {
  try {
    const plans = await prisma.planSubscription.findMany({
      orderBy: {
        price: 'asc'
      }
    });

    if (!plans || plans.length === 0) {
      return res.status(404).json({ error: 'No plans found' });
    }

    return res.status(200).json(plans);
  } catch (error) {
    console.error('Error fetching plans:', error);
    return res.status(500).json({ error: 'Failed to fetch plans' });
  }
};

export const getPlanById = async (req, res) => {
  try {
    const { id } = req.params;

    const plan = await prisma.planSubscription.findUnique({
      where: { id }
    });

    if (!plan) {
      return res.status(404).json({ error: 'Plan not found' });
    }

    return res.status(200).json(plan);
  } catch (error) {
    console.error('Error fetching plan:', error);
    return res.status(500).json({ error: 'Failed to fetch plan' });
  }
};

export const createPlanSubscription = async (req, res) => {
  try {
    const { name, price, monthDuration, infos, visiblePropertiesLimit } = req.body;

    if (!name || price === undefined || !monthDuration || !infos) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const plan = await prisma.planSubscription.create({
      data: {
        name,
        price,
        monthDuration,
        infos,
        visiblePropertiesLimit: visiblePropertiesLimit || 5
      }
    });


    return res.status(201).json(plan);
  } catch (error) {
    console.error('Error creating plan:', error);
    return res.status(500).json({ error: 'Failed to create plan' });
  }
};

export const updatePlanSubscription = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, price, monthDuration, infos, visiblePropertiesLimit } = req.body;

    const plan = await prisma.planSubscription.update({
      where: { id },
      data: {
        ...(name && { name }),
        ...(price !== undefined && { price }),
        ...(monthDuration && { monthDuration }),
        ...(infos && { infos }),
        ...(visiblePropertiesLimit && { visiblePropertiesLimit })
      }
      
    });


    return res.status(200).json(plan);
  } catch (error) {
    console.error('Error updating plan:', error);
    return res.status(500).json({ error: 'Failed to update plan' });
  }
};

export const deletePlanSubscription = async (req, res) => {
  try {
    const { id } = req.params;

    await prisma.planSubscription.delete({
      where: { id }
    });

    return res.status(200).json({ message: 'Plan deleted successfully' });
  } catch (error) {
    console.error('Error deleting plan:', error);
    return res.status(500).json({ error: 'Failed to delete plan' });
  }
};
