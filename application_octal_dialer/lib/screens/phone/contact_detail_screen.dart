import 'package:flutter/material.dart';
import '../../widgets/octal_logo.dart';
import '../../models/phone_models.dart';
import '../../services/telecom_service.dart';

class ContactDetailScreen extends StatelessWidget {
  final PhoneContact contact;

  const ContactDetailScreen({super.key, required this.contact});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: OctalColors.bgDark,
      appBar: AppBar(
        backgroundColor: Colors.transparent,
        elevation: 0,
        leading: IconButton(
          icon: const Icon(Icons.arrow_back_ios_new_rounded, color: Colors.white, size: 20),
          onPressed: () => Navigator.pop(context),
        ),
        actions: [
          IconButton(
            icon: Icon(
              contact.isFavorite ? Icons.star_rounded : Icons.star_border_rounded,
              color: OctalColors.primaryGold,
            ),
            onPressed: () {
              ScaffoldMessenger.of(context).showSnackBar(
                SnackBar(content: Text(contact.isFavorite ? 'Removed from favorites' : 'Added to favorites')),
              );
            },
          ),
          IconButton(
            icon: const Icon(Icons.more_vert_rounded, color: Colors.white),
            onPressed: () {},
          ),
        ],
      ),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.symmetric(horizontal: 24.0, vertical: 16.0),
          child: Column(
            children: [
              // Large Avatar
              Center(
                child: Container(
                  width: 96,
                  height: 96,
                  decoration: BoxDecoration(
                    color: contact.avatarColor,
                    shape: BoxShape.circle,
                    boxShadow: [
                      BoxShadow(
                        color: contact.avatarColor.withOpacity(0.35),
                        blurRadius: 20,
                        spreadRadius: 2,
                      ),
                    ],
                  ),
                  child: Center(
                    child: Text(
                      contact.initials,
                      style: const TextStyle(color: Colors.white, fontSize: 36, fontWeight: FontWeight.bold),
                    ),
                  ),
                ),
              ),

              const SizedBox(height: 16),

              // Name
              Text(
                contact.name,
                style: const TextStyle(
                  fontFamily: 'Ubuntu',
                  fontSize: 22,
                  fontWeight: FontWeight.bold,
                  color: Colors.white,
                ),
                textAlign: TextAlign.center,
              ),

              const SizedBox(height: 6),

              // Number
              Text(
                contact.number,
                style: const TextStyle(
                  fontSize: 14,
                  color: OctalColors.textSecondary,
                  letterSpacing: 0.5,
                ),
                textAlign: TextAlign.center,
              ),

              const SizedBox(height: 28),

              // Quick Actions: Call, Message, Favorite, Share
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceEvenly,
                children: [
                  _buildQuickAction(
                    icon: Icons.call_rounded,
                    label: 'Call',
                    color: OctalColors.primaryGold,
                    onTap: () => TelecomService.instance.placeCall(contact.number),
                  ),
                  _buildQuickAction(
                    icon: Icons.message_rounded,
                    label: 'Message',
                    color: Colors.white,
                    onTap: () {
                      ScaffoldMessenger.of(context).showSnackBar(
                        const SnackBar(content: Text('SMS messaging integration ready.')),
                      );
                    },
                  ),
                  _buildQuickAction(
                    icon: Icons.share_rounded,
                    label: 'Share',
                    color: Colors.white,
                    onTap: () {
                      ScaffoldMessenger.of(context).showSnackBar(
                        SnackBar(content: Text('Share ${contact.name}: ${contact.number}')),
                      );
                    },
                  ),
                ],
              ),

              const SizedBox(height: 32),

              // Contact Info Card
              Container(
                width: double.infinity,
                padding: const EdgeInsets.all(18.0),
                decoration: BoxDecoration(
                  color: OctalColors.surfaceCard,
                  borderRadius: BorderRadius.circular(20),
                  border: Border.all(color: OctalColors.border),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text(
                      'Contact Info',
                      style: TextStyle(
                        color: OctalColors.textSecondary,
                        fontSize: 12,
                        fontWeight: FontWeight.bold,
                        letterSpacing: 1.0,
                      ),
                    ),
                    const SizedBox(height: 14),
                    Row(
                      children: [
                        const Icon(Icons.phone_iphone_rounded, color: OctalColors.primaryGold, size: 22),
                        const SizedBox(width: 14),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                contact.number,
                                style: const TextStyle(color: Colors.white, fontSize: 15, fontWeight: FontWeight.w600),
                              ),
                              const SizedBox(height: 2),
                              const Text('Mobile', style: TextStyle(color: OctalColors.textMuted, fontSize: 12)),
                            ],
                          ),
                        ),
                        IconButton(
                          icon: const Icon(Icons.call_rounded, color: OctalColors.primaryGold, size: 22),
                          onPressed: () => TelecomService.instance.placeCall(contact.number),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildQuickAction({
    required IconData icon,
    required String label,
    required Color color,
    required VoidCallback onTap,
  }) {
    return GestureDetector(
      onTap: onTap,
      child: Column(
        children: [
          Container(
            width: 52,
            height: 52,
            decoration: BoxDecoration(
              color: OctalColors.surfaceCard,
              shape: BoxShape.circle,
              border: Border.all(color: OctalColors.border),
            ),
            child: Center(
              child: Icon(icon, color: color, size: 24),
            ),
          ),
          const SizedBox(height: 8),
          Text(
            label,
            style: const TextStyle(color: Colors.white, fontSize: 12, fontWeight: FontWeight.w500),
          ),
        ],
      ),
    );
  }
}
