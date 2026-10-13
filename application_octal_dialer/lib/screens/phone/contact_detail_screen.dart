import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:url_launcher/url_launcher.dart';
import '../../models/phone_models.dart';
import '../../services/phone_data_service.dart';
import '../../services/telecom_service.dart';

class ContactDetailScreen extends StatefulWidget {
  final PhoneContact contact;

  const ContactDetailScreen({super.key, required this.contact});

  @override
  State<ContactDetailScreen> createState() => _ContactDetailScreenState();
}

class _ContactDetailScreenState extends State<ContactDetailScreen> {
  late bool _isFavorite;
  final PhoneDataService _dataService = PhoneDataService.instance;

  @override
  void initState() {
    super.initState();
    _isFavorite = widget.contact.isFavorite;
  }

  void _toggleFavorite() {
    HapticFeedback.lightImpact();
    _dataService.toggleFavorite(widget.contact.id);
    setState(() {
      _isFavorite = !_isFavorite;
    });
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(_isFavorite ? 'Added to favorites' : 'Removed from favorites'),
        backgroundColor: const Color(0xFF28231F),
        duration: const Duration(seconds: 1),
      ),
    );
  }

  void _sendSms() async {
    final uri = Uri.parse('sms:${widget.contact.number}');
    try {
      if (await canLaunchUrl(uri)) {
        await launchUrl(uri);
      } else {
        await launchUrl(uri, mode: LaunchMode.externalApplication);
      }
    } catch (e) {
      debugPrint('[ContactDetail] sendSms error: $e');
    }
  }

  void _callContact() {
    HapticFeedback.mediumImpact();
    TelecomService.instance.placeCall(widget.contact.number);
  }

  void _showOverflowMenu() {
    showModalBottomSheet(
      context: context,
      backgroundColor: const Color(0xFF28231F),
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
      ),
      builder: (ctx) => SafeArea(
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: 12.0),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              ListTile(
                leading: const Icon(Icons.share_outlined, color: Color(0xFFF0DFD8)),
                title: const Text('Share contact', style: TextStyle(color: Color(0xFFF0DFD8))),
                onTap: () {
                  Navigator.pop(ctx);
                  Clipboard.setData(ClipboardData(text: '${widget.contact.name}: ${widget.contact.number}'));
                  ScaffoldMessenger.of(context).showSnackBar(
                    const SnackBar(content: Text('Contact info copied to clipboard'), backgroundColor: Color(0xFF28231F)),
                  );
                },
              ),
              ListTile(
                leading: const Icon(Icons.block_outlined, color: Color(0xFFF0DFD8)),
                title: Text(
                  _dataService.isNumberBlocked(widget.contact.number) ? 'Unblock number' : 'Block number',
                  style: const TextStyle(color: Color(0xFFF0DFD8)),
                ),
                onTap: () {
                  Navigator.pop(ctx);
                  if (_dataService.isNumberBlocked(widget.contact.number)) {
                    _dataService.unblockNumber(widget.contact.number);
                    ScaffoldMessenger.of(context).showSnackBar(
                      SnackBar(content: Text('${widget.contact.number} unblocked'), backgroundColor: const Color(0xFF28231F)),
                    );
                  } else {
                    _dataService.blockNumber(widget.contact.number);
                    ScaffoldMessenger.of(context).showSnackBar(
                      SnackBar(content: Text('${widget.contact.number} blocked'), backgroundColor: const Color(0xFF28231F)),
                    );
                  }
                },
              ),
            ],
          ),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final contact = widget.contact;
    final initial = contact.name.isNotEmpty ? contact.name[0].toUpperCase() : '?';

    return Scaffold(
      backgroundColor: const Color(0xFF1F1C19),
      appBar: AppBar(
        backgroundColor: const Color(0xFF1F1C19),
        elevation: 0,
        leading: IconButton(
          icon: const Icon(Icons.arrow_back, color: Color(0xFFF0DFD8)),
          onPressed: () => Navigator.pop(context),
        ),
        actions: [
          IconButton(
            icon: Icon(
              _isFavorite ? Icons.star : Icons.star_outline,
              color: _isFavorite ? const Color(0xFFFFB74D) : const Color(0xFFF0DFD8),
            ),
            onPressed: _toggleFavorite,
          ),
          IconButton(
            icon: const Icon(Icons.more_vert, color: Color(0xFFF0DFD8)),
            onPressed: _showOverflowMenu,
          ),
        ],
      ),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.symmetric(horizontal: 20.0, vertical: 12.0),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.center,
            children: [
              const SizedBox(height: 12),
              // Big circle avatar
              Center(
                child: Container(
                  width: 96,
                  height: 96,
                  decoration: BoxDecoration(
                    color: contact.avatarColor,
                    shape: BoxShape.circle,
                  ),
                  child: Center(
                    child: Text(
                      initial,
                      style: const TextStyle(color: Colors.white, fontSize: 40, fontWeight: FontWeight.w600),
                    ),
                  ),
                ),
              ),

              const SizedBox(height: 18),

              // Name
              Text(
                contact.name,
                style: const TextStyle(
                  fontSize: 24,
                  fontWeight: FontWeight.w500,
                  color: Color(0xFFF0DFD8),
                ),
                textAlign: TextAlign.center,
              ),

              const SizedBox(height: 6),

              // Number
              Text(
                contact.number,
                style: const TextStyle(
                  fontSize: 14.5,
                  color: Color(0xFFA49691),
                  letterSpacing: 0.3,
                ),
                textAlign: TextAlign.center,
              ),

              const SizedBox(height: 28),

              // Action buttons row: Call, Text, Video, History
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceEvenly,
                children: [
                  _buildQuickActionButton(
                    icon: Icons.call,
                    label: 'Call',
                    onTap: _callContact,
                  ),
                  _buildQuickActionButton(
                    icon: Icons.message,
                    label: 'Text',
                    onTap: _sendSms,
                  ),
                  _buildQuickActionButton(
                    icon: Icons.videocam_outlined,
                    label: 'Video',
                    onTap: () {
                      ScaffoldMessenger.of(context).showSnackBar(
                        const SnackBar(content: Text('Video calling requires carrier support'), backgroundColor: Color(0xFF28231F)),
                      );
                    },
                  ),
                  _buildQuickActionButton(
                    icon: Icons.history,
                    label: 'History',
                    onTap: () {
                      ScaffoldMessenger.of(context).showSnackBar(
                        SnackBar(content: Text('Call history for ${contact.name}'), backgroundColor: const Color(0xFF28231F)),
                      );
                    },
                  ),
                ],
              ),

              const SizedBox(height: 32),

              // Contact Details Card
              Container(
                width: double.infinity,
                decoration: BoxDecoration(
                  color: const Color(0xFF28231F),
                  borderRadius: BorderRadius.circular(20),
                ),
                padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text(
                      'Contact details',
                      style: TextStyle(
                        color: Color(0xFFA49691),
                        fontSize: 13,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                    const SizedBox(height: 16),
                    Row(
                      children: [
                        const Icon(Icons.phone_outlined, color: Color(0xFFF0DFD8), size: 22),
                        const SizedBox(width: 16),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                contact.number,
                                style: const TextStyle(color: Color(0xFFF0DFD8), fontSize: 16, fontWeight: FontWeight.w500),
                              ),
                              const SizedBox(height: 2),
                              const Text('Mobile', style: TextStyle(color: Color(0xFFA49691), fontSize: 13)),
                            ],
                          ),
                        ),
                        IconButton(
                          icon: const Icon(Icons.message_outlined, color: Color(0xFF5BB974), size: 22),
                          onPressed: _sendSms,
                        ),
                        IconButton(
                          icon: const Icon(Icons.call, color: Color(0xFF5BB974), size: 22),
                          onPressed: _callContact,
                        ),
                      ],
                    ),
                  ],
                ),
              ),

              const SizedBox(height: 24),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildQuickActionButton({
    required IconData icon,
    required String label,
    required VoidCallback onTap,
  }) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(30),
      child: Column(
        children: [
          Container(
            width: 56,
            height: 56,
            decoration: BoxDecoration(
              color: const Color(0xFF28231F),
              shape: BoxShape.circle,
              border: Border.all(color: const Color(0xFF382923)),
            ),
            child: Icon(icon, color: const Color(0xFFF0DFD8), size: 24),
          ),
          const SizedBox(height: 8),
          Text(
            label,
            style: const TextStyle(color: Color(0xFFF0DFD8), fontSize: 12.5, fontWeight: FontWeight.w500),
          ),
        ],
      ),
    );
  }
}
